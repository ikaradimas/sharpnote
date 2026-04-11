'use strict';

const http = require('http');

// Map of serverId → { server, port, title }
const _servers = new Map();

/**
 * Build a route table from an API definition.
 * Each route: { method, pattern (regex), keys (param names), mockResponse }
 */
function buildRoutes(apiDef) {
  const routes = [];
  for (const ctrl of apiDef.controllers || []) {
    for (const ep of ctrl.endpoints || []) {
      const fullPath = (ctrl.basePath || '') + (ep.path || '');
      if (!fullPath) continue;

      // Convert path params like /{id} to regex capture groups
      const keys = [];
      const pattern = fullPath.replace(/\{([^}]+)\}/g, (_, name) => {
        keys.push(name);
        return '([^/]+)';
      });

      routes.push({
        method: (ep.method || 'get').toUpperCase(),
        regex: new RegExp(`^${pattern}$`),
        keys,
        mockResponse: ep.mockResponse || null,
        mockHandler: ep.mockHandler || null,
        summary: ep.summary || fullPath,
      });
    }
  }
  return routes;
}

function matchRoute(routes, method, pathname) {
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = pathname.match(route.regex);
    if (match) {
      const params = {};
      route.keys.forEach((key, i) => { params[key] = match[i + 1]; });
      return { route, params };
    }
  }
  return null;
}

/**
 * Execute a user-defined JS handler function for a mock endpoint.
 * The handler receives a `req` object with { params, query, body, headers, method }
 * and must return { status?, headers?, body } or just a plain value (treated as body).
 */
function executeHandler(handlerCode, reqCtx) {
  // Wrap the user code so it can use `return` and has `req` in scope
  const fn = new Function('req', handlerCode);
  const result = fn(reqCtx);
  if (result === undefined || result === null) return { status: 200, body: '{}' };
  if (typeof result === 'object' && !Array.isArray(result) && ('status' in result || 'body' in result)) {
    // Structured response: { status, headers, body }
    const body = typeof result.body === 'string' ? result.body : JSON.stringify(result.body ?? {});
    return { status: result.status || 200, headers: result.headers || {}, body };
  }
  // Plain value — serialize as JSON body
  const body = typeof result === 'string' ? result : JSON.stringify(result);
  return { status: 200, body };
}

function handleRequest(req, res, rawBody, routes) {
  const url = new URL(req.url, 'http://localhost');
  const method = req.method.toUpperCase();
  const result = matchRoute(routes, method, url.pathname);

  // CORS headers for browser access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!result) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No matching route', method, path: url.pathname }));
    return;
  }

  const { route, params } = result;

  // Parse query string into object
  const query = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });

  // Parse request body as JSON (best-effort)
  let body = rawBody;
  try { body = JSON.parse(rawBody); } catch (_) { /* keep as string */ }

  // Custom handler takes priority over static mockResponse
  if (route.mockHandler) {
    try {
      const reqCtx = { params, query, body, headers: req.headers, method };
      const handlerResult = executeHandler(route.mockHandler, reqCtx);
      const headers = { 'Content-Type': 'application/json', ...(handlerResult.headers || {}) };
      res.writeHead(handlerResult.status, headers);
      res.end(handlerResult.body);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Handler error', message: err.message }));
    }
    return;
  }

  if (!route.mockResponse) {
    res.writeHead(501, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No mock response configured', endpoint: route.summary, params }));
    return;
  }

  const mock = route.mockResponse;
  const headers = { 'Content-Type': 'application/json', ...(mock.headers || {}) };
  const status = mock.status || 200;

  // Substitute path params in body: {{id}} → actual value
  let respBody = mock.body || '{}';
  for (const [key, val] of Object.entries(params)) {
    respBody = respBody.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  }

  res.writeHead(status, headers);
  res.end(respBody);
}

/** Pick a random port in the 9001–9999 range. */
function randomPort() {
  return 9001 + Math.floor(Math.random() * 999);
}

function startMockServer(apiDef, port = 0) {
  const id = apiDef.id || `mock_${Date.now()}`;

  // Stop existing server for this ID if running
  if (_servers.has(id)) stopMockServer(id);

  const routes = buildRoutes(apiDef);
  const usePort = port || randomPort();

  const server = http.createServer((req, res) => {
    // Collect request body before handling
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString();
      handleRequest(req, res, rawBody, routes);
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(usePort, '127.0.0.1', () => {
      const actualPort = server.address().port;
      _servers.set(id, { server, port: actualPort, title: apiDef.title || id });
      resolve({ port: actualPort, id });
    });
    server.on('error', (err) => {
      // If port collision, retry with another random port
      if (err.code === 'EADDRINUSE' && port === 0) {
        server.listen(0, '127.0.0.1', () => {
          const actualPort = server.address().port;
          _servers.set(id, { server, port: actualPort, title: apiDef.title || id });
          resolve({ port: actualPort, id });
        });
      } else {
        reject(err);
      }
    });
  });
}

function stopMockServer(id) {
  if (id) {
    const entry = _servers.get(id);
    if (entry) {
      entry.server.close();
      _servers.delete(id);
    }
  } else {
    // Legacy: stop all
    for (const [key, entry] of _servers) {
      entry.server.close();
      _servers.delete(key);
    }
  }
}

function stopAll() {
  for (const [, entry] of _servers) entry.server.close();
  _servers.clear();
}

function isRunning(id) {
  if (id) return _servers.has(id);
  return _servers.size > 0;
}

function listServers() {
  return [..._servers.entries()].map(([id, { port, title }]) => ({ id, port, title }));
}

function register(ipcMain) {
  ipcMain.handle('mock-server-start', async (_ev, { apiDef, port }) => {
    try {
      const result = await startMockServer(apiDef, port || 0);
      return { success: true, port: result.port, id: result.id };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('mock-server-stop', async (_ev, data) => {
    const id = typeof data === 'string' ? data : data?.id;
    stopMockServer(id || undefined);
    return { success: true };
  });

  ipcMain.handle('mock-server-status', (_ev, data) => {
    const id = typeof data === 'string' ? data : data?.id;
    if (id) {
      const entry = _servers.get(id);
      return { running: !!entry, port: entry?.port ?? null };
    }
    return { running: _servers.size > 0, servers: listServers() };
  });

  ipcMain.handle('mock-server-list', () => listServers());

  ipcMain.handle('mock-server-stop-all', () => {
    stopAll();
    return { success: true };
  });
}

module.exports = { startMockServer, stopMockServer, stopAll, isRunning, listServers, buildRoutes, matchRoute, executeHandler, register };
