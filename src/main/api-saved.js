'use strict';

const path = require('path');
const fs   = require('fs');

let _path = '';

// ── Built-in example API definition ──────────────────────────────────────────
// Demonstrates all API Editor features: models with various field types
// (including arrays and model refs), multiple controllers, all HTTP methods,
// path/query parameters, headers, request bodies, multiple response codes,
// static mock responses with {{param}} substitution, and custom JS handlers.

const EXAMPLE_API = {
  id: 'example0',
  type: 'editor',
  title: 'Bookstore API',
  description: 'Example API demonstrating all API Editor features — models, controllers, parameters, headers, request bodies, responses, static mocks, and custom handlers.',
  version: '1.0.0',
  baseUrl: 'http://localhost:4000',
  models: [
    {
      id: 'mdl_auth', name: 'Author', description: 'A book author',
      fields: [
        { name: 'id', type: 'uuid', required: true, description: 'Unique identifier' },
        { name: 'name', type: 'string', required: true, description: 'Full name' },
        { name: 'bio', type: 'string', required: false, description: 'Author biography' },
        { name: 'born', type: 'date', required: false, description: 'Date of birth' },
      ],
    },
    {
      id: 'mdl_book', name: 'Book', description: 'A book in the catalogue',
      fields: [
        { name: 'id', type: 'int', required: true, description: 'Book ID' },
        { name: 'title', type: 'string', required: true, description: 'Title' },
        { name: 'isbn', type: 'string', required: true, description: 'ISBN-13' },
        { name: 'price', type: 'double', required: true, description: 'Cover price' },
        { name: 'published', type: 'datetime', required: false, description: 'Publication date' },
        { name: 'inStock', type: 'bool', required: true, description: 'Whether in stock' },
        { name: 'author', type: 'Author', required: true, description: 'Author reference' },
        { name: 'tags', type: 'string[]', required: false, description: 'Genre/topic tags' },
      ],
    },
    {
      id: 'mdl_revw', name: 'Review', description: 'A book review submitted by a reader',
      fields: [
        { name: 'id', type: 'int', required: true, description: 'Review ID' },
        { name: 'bookId', type: 'int', required: true, description: 'Reviewed book ID' },
        { name: 'rating', type: 'int', required: true, description: 'Rating 1-5' },
        { name: 'comment', type: 'string', required: false, description: 'Review text' },
        { name: 'createdAt', type: 'datetime', required: true, description: 'Submission timestamp' },
      ],
    },
    {
      id: 'mdl_ordr', name: 'Order', description: 'A customer order',
      fields: [
        { name: 'id', type: 'uuid', required: true, description: 'Order ID' },
        { name: 'customer', type: 'string', required: true, description: 'Customer name' },
        { name: 'items', type: 'Book[]', required: true, description: 'Ordered books' },
        { name: 'total', type: 'double', required: true, description: 'Order total' },
        { name: 'status', type: 'string', required: true, description: 'pending | shipped | delivered' },
        { name: 'placedAt', type: 'datetime', required: true, description: 'Order date' },
      ],
    },
  ],
  controllers: [
    // ── Books controller — static mocks with param substitution ────────────
    {
      id: 'ctrl_bk', name: 'Books', description: 'Book catalogue CRUD', basePath: '/api/books',
      endpoints: [
        {
          id: 'ep_bk_ls', method: 'get', path: '/',
          summary: 'List books', description: 'Returns a paginated list of books with optional search.',
          parameters: [
            { name: 'page', in: 'query', description: 'Page number (1-based)', required: false, schema: 'int' },
            { name: 'limit', in: 'query', description: 'Items per page (default 20)', required: false, schema: 'int' },
            { name: 'search', in: 'query', description: 'Full-text search on title/author', required: false, schema: 'string' },
          ],
          headers: [
            { name: 'Accept-Language', description: 'Preferred locale for descriptions', required: false, schema: 'string' },
          ],
          requestBody: null,
          responses: [
            { status: '200', schema: 'Book', description: 'Array of books (paginated)' },
          ],
          mockResponse: { status: 200, headers: {}, body: JSON.stringify([
            { id: 1, title: 'The Pragmatic Programmer', isbn: '978-0135957059', price: 49.99, inStock: true, author: { id: 'a1', name: 'David Thomas' }, tags: ['programming', 'software'] },
            { id: 2, title: 'Clean Code', isbn: '978-0132350884', price: 39.99, inStock: true, author: { id: 'a2', name: 'Robert C. Martin' }, tags: ['programming'] },
          ], null, 2) },
          mockHandler: null,
        },
        {
          id: 'ep_bk_gt', method: 'get', path: '/{id}',
          summary: 'Get book by ID', description: 'Returns a single book with its author. Uses {{id}} substitution in the mock response.',
          parameters: [
            { name: 'id', in: 'path', description: 'Book ID', required: true, schema: 'int' },
          ],
          headers: [],
          requestBody: null,
          responses: [
            { status: '200', schema: 'Book', description: 'The requested book' },
            { status: '404', schema: '', description: 'Book not found' },
          ],
          mockResponse: { status: 200, headers: {}, body: JSON.stringify({ id: '{{id}}', title: 'The Pragmatic Programmer', isbn: '978-0135957059', price: 49.99, inStock: true, author: { id: 'a1', name: 'David Thomas' }, tags: ['programming'] }) },
          mockHandler: null,
        },
        {
          id: 'ep_bk_cr', method: 'post', path: '/',
          summary: 'Create a book', description: 'Adds a new book to the catalogue. Requires authentication via X-API-Key header.',
          parameters: [],
          headers: [
            { name: 'X-API-Key', description: 'API authentication key', required: true, schema: 'string' },
          ],
          requestBody: { schema: 'Book', contentType: 'application/json', description: 'Book to create (id is auto-assigned)' },
          responses: [
            { status: '201', schema: 'Book', description: 'Created book with assigned ID' },
            { status: '400', schema: '', description: 'Validation error' },
            { status: '401', schema: '', description: 'Missing or invalid API key' },
          ],
          mockResponse: null,
          mockHandler: [
            '// Custom handler: validates input and returns created book',
            'if (!req.headers["x-api-key"]) {',
            '  return { status: 401, body: { error: "Missing X-API-Key header" } };',
            '}',
            'if (!req.body?.title) {',
            '  return { status: 400, body: { error: "Title is required" } };',
            '}',
            'return {',
            '  status: 201,',
            '  body: { id: Math.floor(Math.random() * 1000), ...req.body, inStock: true }',
            '};',
          ].join('\n'),
        },
        {
          id: 'ep_bk_up', method: 'put', path: '/{id}',
          summary: 'Update a book', description: 'Replaces a book\'s data entirely.',
          parameters: [
            { name: 'id', in: 'path', description: 'Book ID', required: true, schema: 'int' },
          ],
          headers: [
            { name: 'X-API-Key', description: 'API authentication key', required: true, schema: 'string' },
          ],
          requestBody: { schema: 'Book', contentType: 'application/json', description: 'Complete book object' },
          responses: [
            { status: '200', schema: 'Book', description: 'Updated book' },
            { status: '404', schema: '', description: 'Book not found' },
          ],
          mockResponse: null,
          mockHandler: [
            '// Echo back the body with the path ID',
            'return { status: 200, body: { ...req.body, id: parseInt(req.params.id) } };',
          ].join('\n'),
        },
        {
          id: 'ep_bk_dl', method: 'delete', path: '/{id}',
          summary: 'Delete a book', description: 'Removes a book from the catalogue.',
          parameters: [
            { name: 'id', in: 'path', description: 'Book ID', required: true, schema: 'int' },
          ],
          headers: [
            { name: 'X-API-Key', description: 'API authentication key', required: true, schema: 'string' },
          ],
          requestBody: null,
          responses: [
            { status: '204', schema: '', description: 'Deleted successfully' },
            { status: '404', schema: '', description: 'Book not found' },
          ],
          mockResponse: { status: 204, headers: {}, body: '' },
          mockHandler: null,
        },
      ],
    },
    // ── Reviews controller — custom handlers with dynamic logic ────────────
    {
      id: 'ctrl_rv', name: 'Reviews', description: 'Book reviews with dynamic mock handlers', basePath: '/api/reviews',
      endpoints: [
        {
          id: 'ep_rv_ls', method: 'get', path: '/{bookId}',
          summary: 'List reviews for a book', description: 'Returns all reviews for a given book, generated dynamically by the mock handler.',
          parameters: [
            { name: 'bookId', in: 'path', description: 'Book ID', required: true, schema: 'int' },
          ],
          headers: [],
          requestBody: null,
          responses: [
            { status: '200', schema: 'Review', description: 'Array of reviews' },
          ],
          mockResponse: null,
          mockHandler: [
            '// Generate dynamic reviews based on the book ID',
            'const bookId = parseInt(req.params.bookId);',
            'const reviews = [];',
            'for (let i = 1; i <= 3; i++) {',
            '  reviews.push({',
            '    id: bookId * 100 + i,',
            '    bookId,',
            '    rating: Math.min(5, i + 2),',
            '    comment: `Review #${i} for book ${bookId}`,',
            '    createdAt: new Date(Date.now() - i * 86400000).toISOString(),',
            '  });',
            '}',
            'return reviews;',
          ].join('\n'),
        },
        {
          id: 'ep_rv_cr', method: 'post', path: '/{bookId}',
          summary: 'Submit a review', description: 'Posts a new review for a book. Validates rating range in the handler.',
          parameters: [
            { name: 'bookId', in: 'path', description: 'Book ID', required: true, schema: 'int' },
          ],
          headers: [],
          requestBody: { schema: 'Review', contentType: 'application/json', description: 'Review data (bookId is taken from path)' },
          responses: [
            { status: '201', schema: 'Review', description: 'Created review' },
            { status: '400', schema: '', description: 'Invalid rating (must be 1-5)' },
          ],
          mockResponse: null,
          mockHandler: [
            '// Validate rating and return created review',
            'const { body } = req;',
            'const rating = body?.rating;',
            'if (!rating || rating < 1 || rating > 5) {',
            '  return { status: 400, body: { error: "Rating must be between 1 and 5" } };',
            '}',
            'return {',
            '  status: 201,',
            '  body: {',
            '    id: Math.floor(Math.random() * 10000),',
            '    bookId: parseInt(req.params.bookId),',
            '    rating,',
            '    comment: body.comment || "",',
            '    createdAt: new Date().toISOString(),',
            '  }',
            '};',
          ].join('\n'),
        },
      ],
    },
    // ── Orders controller — mixed static and handler endpoints ─────────────
    {
      id: 'ctrl_or', name: 'Orders', description: 'Order management with mixed mock strategies', basePath: '/api/orders',
      endpoints: [
        {
          id: 'ep_or_cr', method: 'post', path: '/',
          summary: 'Place an order', description: 'Creates a new order. The handler computes the total from items.',
          parameters: [],
          headers: [
            { name: 'Authorization', description: 'Bearer token', required: true, schema: 'string' },
          ],
          requestBody: { schema: 'Order', contentType: 'application/json', description: 'Order with items array' },
          responses: [
            { status: '201', schema: 'Order', description: 'Created order with computed total' },
            { status: '401', schema: '', description: 'Unauthorized' },
          ],
          mockResponse: null,
          mockHandler: [
            '// Compute order total from items and return',
            'const auth = req.headers["authorization"];',
            'if (!auth || !auth.startsWith("Bearer ")) {',
            '  return { status: 401, body: { error: "Bearer token required" } };',
            '}',
            'const items = req.body?.items || [];',
            'const total = items.reduce((sum, b) => sum + (b.price || 0), 0);',
            'return {',
            '  status: 201,',
            '  headers: { "X-Order-Total": String(total.toFixed(2)) },',
            '  body: {',
            '    id: crypto.randomUUID?.() || "ord-" + Date.now(),',
            '    customer: req.body?.customer || "Anonymous",',
            '    items,',
            '    total,',
            '    status: "pending",',
            '    placedAt: new Date().toISOString(),',
            '  }',
            '};',
          ].join('\n'),
        },
        {
          id: 'ep_or_gt', method: 'get', path: '/{id}',
          summary: 'Get order by ID', description: 'Returns order details. Uses static mock with {{id}} substitution.',
          parameters: [
            { name: 'id', in: 'path', description: 'Order UUID', required: true, schema: 'uuid' },
          ],
          headers: [],
          requestBody: null,
          responses: [
            { status: '200', schema: 'Order', description: 'Order details' },
            { status: '404', schema: '', description: 'Order not found' },
          ],
          mockResponse: { status: 200, headers: {}, body: JSON.stringify({ id: '{{id}}', customer: 'Jane Doe', items: [{ id: 1, title: 'Clean Code', price: 39.99 }], total: 39.99, status: 'shipped', placedAt: '2026-04-01T10:00:00Z' }) },
          mockHandler: null,
        },
        {
          id: 'ep_or_pt', method: 'patch', path: '/{id}/status',
          summary: 'Update order status', description: 'Updates only the status field on an order.',
          parameters: [
            { name: 'id', in: 'path', description: 'Order UUID', required: true, schema: 'uuid' },
          ],
          headers: [],
          requestBody: null,
          responses: [
            { status: '200', schema: 'Order', description: 'Updated order' },
          ],
          mockResponse: null,
          mockHandler: [
            '// Update status from query or body',
            'const newStatus = req.query.status || req.body?.status || "shipped";',
            'return {',
            '  body: { id: req.params.id, status: newStatus, updatedAt: new Date().toISOString() }',
            '};',
          ].join('\n'),
        },
      ],
    },
  ],
};

function loadApiSaved(userDataPath) {
  if (userDataPath) _path = path.join(userDataPath, 'api-saved.json');
  try {
    const list = JSON.parse(fs.readFileSync(_path, 'utf-8'));
    // Ensure the built-in example is present
    if (!list.some((a) => a.id === EXAMPLE_API.id)) list.push(EXAMPLE_API);
    return list;
  } catch {
    return [EXAMPLE_API];
  }
}

function saveApiSaved(list, userDataPath) {
  if (userDataPath) _path = path.join(userDataPath, 'api-saved.json');
  try {
    fs.mkdirSync(path.dirname(_path), { recursive: true });
    const tmp = _path + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf-8');
    fs.renameSync(tmp, _path);
  } catch (err) { console.error('[api-saved] save failed:', err.message); }
}

function register(ipcMain, { app }) {
  _path = path.join(app.getPath('userData'), 'api-saved.json');
  ipcMain.handle('api-saved-load', () => loadApiSaved());
  ipcMain.handle('api-saved-save', (_event, list) => saveApiSaved(list));
}

module.exports = { loadApiSaved, saveApiSaved, register };
