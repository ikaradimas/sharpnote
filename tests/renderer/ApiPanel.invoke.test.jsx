import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ApiPanel, applyAuth, buildRequestUrl, buildHttpClientSnippet } from '../../src/components/panels/ApiPanel.jsx';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SPEC = {
  openapi: '3.0.3',
  info: { title: 'Test API', version: '1.0.0' },
  servers: [{ url: 'https://api.example.com' }],
  paths: {
    '/items': {
      get: {
        tags: ['items'],
        summary: 'List items',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer' }, description: 'Max items' },
        ],
        responses: { '200': { description: 'OK' } },
      },
      post: {
        tags: ['items'],
        summary: 'Create item',
        requestBody: { required: true, content: { 'application/json': {} } },
        responses: { '201': { description: 'Created' } },
      },
    },
    '/items/{id}': {
      get: {
        tags: ['items'],
        summary: 'Get item',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } },
      },
    },
  },
};

const SAVED_APIS = [
  {
    id: 'abc123',
    url: 'https://saved.example.com/openapi.json',
    title: 'Saved API',
    auth: { type: 'bearer', token: 'saved-token', keyName: 'X-API-Key', keyValue: '', keyIn: 'header', username: '', password: '' },
  },
];

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  window.electronAPI = {
    fetchUrl:     vi.fn().mockResolvedValue(JSON.stringify(SPEC)),
    loadApiSaved: vi.fn().mockResolvedValue([]),
    saveApiSaved: vi.fn().mockResolvedValue(undefined),
    apiRequest:   vi.fn(),
  };
});

// ── Helper ────────────────────────────────────────────────────────────────────

async function loadSpec(container) {
  fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
    target: { value: 'https://api.example.com/openapi.json' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Load' }));
  await waitFor(() => screen.getByText('Test API'));
}

async function expandOp(summary) {
  fireEvent.click(screen.getByText(summary));
}

// ── applyAuth unit tests ──────────────────────────────────────────────────────

describe('applyAuth', () => {
  it('does nothing for type none', () => {
    const headers = {}; const qp = {};
    applyAuth(headers, qp, { type: 'none' });
    expect(headers).toEqual({});
    expect(qp).toEqual({});
  });

  it('sets Authorization: Bearer for bearer type', () => {
    const headers = {}; const qp = {};
    applyAuth(headers, qp, { type: 'bearer', token: 'my-token' });
    expect(headers['Authorization']).toBe('Bearer my-token');
  });

  it('does not set Authorization for bearer with empty token', () => {
    const headers = {}; const qp = {};
    applyAuth(headers, qp, { type: 'bearer', token: '' });
    expect(headers['Authorization']).toBeUndefined();
  });

  it('sets custom header for apikey in header', () => {
    const headers = {}; const qp = {};
    applyAuth(headers, qp, { type: 'apikey', keyName: 'X-Key', keyValue: 'secret', keyIn: 'header' });
    expect(headers['X-Key']).toBe('secret');
    expect(qp['X-Key']).toBeUndefined();
  });

  it('sets query param for apikey in query', () => {
    const headers = {}; const qp = {};
    applyAuth(headers, qp, { type: 'apikey', keyName: 'api_key', keyValue: 'secret', keyIn: 'query' });
    expect(qp['api_key']).toBe('secret');
    expect(headers['api_key']).toBeUndefined();
  });

  it('sets Authorization: Basic for basic type', () => {
    const headers = {}; const qp = {};
    applyAuth(headers, qp, { type: 'basic', username: 'user', password: 'pass' });
    expect(headers['Authorization']).toBe(`Basic ${btoa('user:pass')}`);
  });
});

// ── buildRequestUrl unit tests ────────────────────────────────────────────────

describe('buildRequestUrl', () => {
  it('combines base URL and path', () => {
    expect(buildRequestUrl('https://api.example.com', '/items', {}, {}))
      .toBe('https://api.example.com/items');
  });

  it('substitutes path parameters', () => {
    expect(buildRequestUrl('https://api.example.com', '/items/{id}', { id: '42' }, {}))
      .toBe('https://api.example.com/items/42');
  });

  it('encodes path parameter values', () => {
    expect(buildRequestUrl('https://api.example.com', '/items/{id}', { id: 'foo bar' }, {}))
      .toBe('https://api.example.com/items/foo%20bar');
  });

  it('appends non-empty query params', () => {
    const url = buildRequestUrl('https://api.example.com', '/items', {}, { limit: '10', page: '' });
    expect(url).toBe('https://api.example.com/items?limit=10');
  });

  it('omits empty query params', () => {
    expect(buildRequestUrl('https://api.example.com', '/items', {}, { limit: '' }))
      .toBe('https://api.example.com/items');
  });
});

// ── Auth config UI ────────────────────────────────────────────────────────────

describe('AuthConfig UI', () => {
  it('renders auth type selector', () => {
    render(<ApiPanel onToggle={() => {}} />);
    expect(screen.getByDisplayValue('None')).toBeInTheDocument();
  });

  it('shows token input when bearer is selected', () => {
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByDisplayValue('None'), { target: { value: 'bearer' } });
    expect(screen.getByPlaceholderText('Token')).toBeInTheDocument();
  });

  it('shows name/value/in inputs when apikey is selected', () => {
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByDisplayValue('None'), { target: { value: 'apikey' } });
    expect(screen.getByPlaceholderText('Header / param name')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Value')).toBeInTheDocument();
    expect(screen.getByDisplayValue('header')).toBeInTheDocument();
  });

  it('shows username and password inputs when basic is selected', () => {
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByDisplayValue('None'), { target: { value: 'basic' } });
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
  });
});

// ── Try-it UI ─────────────────────────────────────────────────────────────────

describe('Try-it form', () => {
  it('shows Try it button when an operation is expanded', async () => {
    render(<ApiPanel onToggle={() => {}} />);
    await loadSpec();
    await expandOp('List items');
    expect(screen.getByText(/Try it/i)).toBeInTheDocument();
  });

  it('shows query param input after opening Try it', async () => {
    render(<ApiPanel onToggle={() => {}} />);
    await loadSpec();
    await expandOp('List items');
    fireEvent.click(screen.getByText(/▸ Try it/i));
    // Both the params table and the try-it form show 'limit' — verify at least one is a tryit param name
    const matches = screen.getAllByText('limit');
    expect(matches.some(el => el.classList.contains('api-tryit-param-name'))).toBe(true);
    expect(screen.getByRole('button', { name: 'Execute' })).toBeInTheDocument();
  });

  it('shows path param input for parametrised path', async () => {
    render(<ApiPanel onToggle={() => {}} />);
    await loadSpec();
    await expandOp('Get item');
    fireEvent.click(screen.getByText(/▸ Try it/i));
    const matches = screen.getAllByText('id');
    expect(matches.some(el => el.classList.contains('api-tryit-param-name'))).toBe(true);
  });

  it('shows body textarea for POST operation', async () => {
    render(<ApiPanel onToggle={() => {}} />);
    await loadSpec();
    await expandOp('Create item');
    fireEvent.click(screen.getByText(/▸ Try it/i));
    expect(screen.getByPlaceholderText(/key.*value/i)).toBeInTheDocument();
  });

  it('calls apiRequest with correct URL and method on Execute', async () => {
    window.electronAPI.apiRequest.mockResolvedValue({
      status: 200, statusText: 'OK', headers: {}, body: '[]', duration: 12,
    });
    render(<ApiPanel onToggle={() => {}} />);
    await loadSpec();
    await expandOp('List items');
    fireEvent.click(screen.getByText(/▸ Try it/i));
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    await waitFor(() => expect(window.electronAPI.apiRequest).toHaveBeenCalled());
    const call = window.electronAPI.apiRequest.mock.calls[0][0];
    expect(call.method).toBe('get');
    expect(call.url).toContain('/items');
  });

  it('sends bearer token in Authorization header', async () => {
    window.electronAPI.apiRequest.mockResolvedValue({
      status: 200, statusText: 'OK', headers: {}, body: '', duration: 5,
    });
    render(<ApiPanel onToggle={() => {}} />);
    await loadSpec();

    // Set bearer auth
    fireEvent.change(screen.getByDisplayValue('None'), { target: { value: 'bearer' } });
    fireEvent.change(screen.getByPlaceholderText('Token'), { target: { value: 'my-secret' } });

    await expandOp('List items');
    fireEvent.click(screen.getByText(/▸ Try it/i));
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    await waitFor(() => expect(window.electronAPI.apiRequest).toHaveBeenCalled());
    const call = window.electronAPI.apiRequest.mock.calls[0][0];
    expect(call.headers['Authorization']).toBe('Bearer my-secret');
  });

  it('appends api key as query param when keyIn is query', async () => {
    window.electronAPI.apiRequest.mockResolvedValue({
      status: 200, statusText: 'OK', headers: {}, body: '', duration: 5,
    });
    render(<ApiPanel onToggle={() => {}} />);
    await loadSpec();

    fireEvent.change(screen.getByDisplayValue('None'), { target: { value: 'apikey' } });
    fireEvent.change(screen.getByPlaceholderText('Header / param name'), { target: { value: 'token' } });
    fireEvent.change(screen.getByPlaceholderText('Value'), { target: { value: 'abc' } });
    fireEvent.change(screen.getByDisplayValue('header'), { target: { value: 'query' } });

    await expandOp('List items');
    fireEvent.click(screen.getByText(/▸ Try it/i));
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    await waitFor(() => expect(window.electronAPI.apiRequest).toHaveBeenCalled());
    const call = window.electronAPI.apiRequest.mock.calls[0][0];
    expect(call.url).toContain('token=abc');
  });

  it('displays response status and body after execution', async () => {
    window.electronAPI.apiRequest.mockResolvedValue({
      status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' }, body: '{"ok":true}', duration: 8,
    });
    render(<ApiPanel onToggle={() => {}} />);
    await loadSpec();
    await expandOp('List items');
    fireEvent.click(screen.getByText(/▸ Try it/i));
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    await waitFor(() => screen.getByText(/8ms/));
    // 200 may appear in both the spec response table and the try-it status badge
    expect(screen.getAllByText('200').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/8ms/)).toBeInTheDocument();
    expect(screen.getByText(/"ok": true/)).toBeInTheDocument();
  });

  it('shows error message on request failure', async () => {
    window.electronAPI.apiRequest.mockRejectedValue(new Error('Connection refused'));
    render(<ApiPanel onToggle={() => {}} />);
    await loadSpec();
    await expandOp('List items');
    fireEvent.click(screen.getByText(/▸ Try it/i));
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    await waitFor(() => screen.getByText(/Connection refused/));
  });

  it('shows headers when Headers button is clicked', async () => {
    window.electronAPI.apiRequest.mockResolvedValue({
      status: 200, statusText: 'OK',
      headers: { 'content-type': 'application/json', 'x-request-id': 'abc' },
      body: '', duration: 3,
    });
    render(<ApiPanel onToggle={() => {}} />);
    await loadSpec();
    await expandOp('List items');
    fireEvent.click(screen.getByText(/▸ Try it/i));
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    await waitFor(() => screen.getByRole('button', { name: 'Headers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Headers' }));
    expect(screen.getByText('content-type')).toBeInTheDocument();
    expect(screen.getByText('x-request-id')).toBeInTheDocument();
  });
});

// ── Saved APIs ────────────────────────────────────────────────────────────────

describe('Saved APIs', () => {
  it('renders the saved APIs dropdown', () => {
    render(<ApiPanel onToggle={() => {}} />);
    // Multiple <select> elements exist (saved-select + auth-type); verify the saved one
    expect(screen.getByText('— saved APIs —')).toBeInTheDocument();
  });

  it('loads saved APIs on mount', async () => {
    window.electronAPI.loadApiSaved.mockResolvedValue(SAVED_APIS);
    render(<ApiPanel onToggle={() => {}} />);
    await waitFor(() => screen.getByText('Saved API'));
  });

  it('populates URL and auth when a saved API is selected', async () => {
    window.electronAPI.loadApiSaved.mockResolvedValue(SAVED_APIS);
    render(<ApiPanel onToggle={() => {}} />);
    await waitFor(() => screen.getByText('Saved API'));

    // Target the saved-APIs select specifically (first combobox)
    const selects = screen.getAllByRole('combobox');
    const savedSelect = selects.find(s => s.classList.contains('api-saved-select'));
    fireEvent.change(savedSelect, { target: { value: 'abc123' } });

    expect(screen.getByPlaceholderText(/openapi/i).value)
      .toBe('https://saved.example.com/openapi.json');
    // Auth type should have switched to bearer
    expect(screen.getByDisplayValue('Bearer')).toBeInTheDocument();
  });

  it('saves current URL and auth when Save is clicked', async () => {
    render(<ApiPanel onToggle={() => {}} />);
    await waitFor(() => {}); // let useEffect settle

    fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
      target: { value: 'https://new.example.com/openapi.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(window.electronAPI.saveApiSaved).toHaveBeenCalled());
    const saved = window.electronAPI.saveApiSaved.mock.calls[0][0];
    expect(saved.length).toBe(1);
    expect(saved[0].url).toBe('https://new.example.com/openapi.json');
  });

  it('saves spec title when spec is loaded', async () => {
    render(<ApiPanel onToggle={() => {}} />);
    await loadSpec();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(window.electronAPI.saveApiSaved).toHaveBeenCalled());
    const saved = window.electronAPI.saveApiSaved.mock.calls[0][0];
    expect(saved[0].title).toBe('Test API');
  });

  it('deletes the selected saved API when Delete is clicked', async () => {
    window.electronAPI.loadApiSaved.mockResolvedValue(SAVED_APIS);
    render(<ApiPanel onToggle={() => {}} />);
    await waitFor(() => screen.getByText('Saved API'));

    const selects = screen.getAllByRole('combobox');
    const savedSelect = selects.find(s => s.classList.contains('api-saved-select'));
    fireEvent.change(savedSelect, { target: { value: 'abc123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(window.electronAPI.saveApiSaved).toHaveBeenCalled());
    const saved = window.electronAPI.saveApiSaved.mock.calls[0][0];
    expect(saved).toHaveLength(0);
  });

  it('Delete button is disabled when no saved API is selected', () => {
    render(<ApiPanel onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});

// ── buildHttpClientSnippet unit tests ─────────────────────────────────────────

const NO_AUTH = { type: 'none', token: '', keyName: '', keyValue: '', keyIn: 'header', username: '', password: '' };

describe('buildHttpClientSnippet', () => {
  it('generates a GET call with the correct URL', () => {
    const op = { parameters: [], responses: {} };
    const snippet = buildHttpClientSnippet('get', '/items', op, 'https://api.example.com', NO_AUTH);
    expect(snippet).toContain('client.GetAsync("https://api.example.com/items")');
    expect(snippet).toContain('EnsureSuccessStatusCode');
    expect(snippet).toContain('body.Display()');
  });

  it('generates path param variables with string interpolation', () => {
    const op = { parameters: [{ name: 'id', in: 'path', schema: { type: 'string' } }], responses: {} };
    const snippet = buildHttpClientSnippet('get', '/items/{id}', op, 'https://api.example.com', NO_AUTH);
    expect(snippet).toContain('var id = "<id>";');
    expect(snippet).toContain('$"https://api.example.com/items/${id}"');
  });

  it('includes Bearer auth header', () => {
    const auth = { ...NO_AUTH, type: 'bearer', token: 'my-secret' };
    const op = { parameters: [], responses: {} };
    const snippet = buildHttpClientSnippet('get', '/items', op, 'https://api.example.com', auth);
    expect(snippet).toContain('AuthenticationHeaderValue("Bearer", "my-secret")');
  });

  it('uses placeholder when bearer token is empty', () => {
    const auth = { ...NO_AUTH, type: 'bearer', token: '' };
    const op = { parameters: [], responses: {} };
    const snippet = buildHttpClientSnippet('get', '/items', op, 'https://api.example.com', auth);
    expect(snippet).toContain('<bearer-token>');
  });

  it('adds api key as header when keyIn is header', () => {
    const auth = { ...NO_AUTH, type: 'apikey', keyName: 'X-Key', keyValue: 'abc', keyIn: 'header' };
    const op = { parameters: [], responses: {} };
    const snippet = buildHttpClientSnippet('get', '/items', op, 'https://api.example.com', auth);
    expect(snippet).toContain('DefaultRequestHeaders.Add("X-Key", "abc")');
  });

  it('appends api key to URL when keyIn is query', () => {
    const auth = { ...NO_AUTH, type: 'apikey', keyName: 'token', keyValue: 'xyz', keyIn: 'query' };
    const op = { parameters: [], responses: {} };
    const snippet = buildHttpClientSnippet('get', '/items', op, 'https://api.example.com', auth);
    expect(snippet).toContain('token=xyz');
  });

  it('includes Basic auth credentials', () => {
    const auth = { ...NO_AUTH, type: 'basic', username: 'user', password: 'pass' };
    const op = { parameters: [], responses: {} };
    const snippet = buildHttpClientSnippet('get', '/items', op, 'https://api.example.com', auth);
    expect(snippet).toContain('"user:pass"');
    expect(snippet).toContain('AuthenticationHeaderValue("Basic"');
  });

  it('generates a POST call with request body template', () => {
    const op = { requestBody: { required: true, content: { 'application/json': {} } }, parameters: [], responses: {} };
    const snippet = buildHttpClientSnippet('post', '/items', op, 'https://api.example.com', NO_AUTH);
    expect(snippet).toContain('client.PostAsync(');
    expect(snippet).toContain('StringContent(');
    expect(snippet).toContain('// TODO: fill in request body');
  });

  it('uses SendAsync for non-standard methods', () => {
    const op = { parameters: [], responses: {} };
    const snippet = buildHttpClientSnippet('options', '/items', op, 'https://api.example.com', NO_AUTH);
    expect(snippet).toContain('SendAsync');
    expect(snippet).toContain('"OPTIONS"');
  });
});

// ── Inject button ─────────────────────────────────────────────────────────────

describe('Inject button', () => {
  it('shows Inject button when onInsert is provided and operation is expanded', async () => {
    const onInsert = vi.fn();
    render(<ApiPanel onToggle={() => {}} onInsert={onInsert} />);
    await loadSpec();
    await expandOp('List items');
    expect(screen.getByRole('button', { name: /Inject/i })).toBeInTheDocument();
  });

  it('does not show Inject button when onInsert is not provided', async () => {
    render(<ApiPanel onToggle={() => {}} />);
    await loadSpec();
    await expandOp('List items');
    expect(screen.queryByRole('button', { name: /Inject/i })).not.toBeInTheDocument();
  });

  it('calls onInsert with a C# snippet when clicked', async () => {
    const onInsert = vi.fn();
    render(<ApiPanel onToggle={() => {}} onInsert={onInsert} />);
    await loadSpec();
    await expandOp('List items');
    fireEvent.click(screen.getByRole('button', { name: /Inject/i }));
    expect(onInsert).toHaveBeenCalledOnce();
    const snippet = onInsert.mock.calls[0][0];
    expect(snippet).toContain('HttpClient');
    expect(snippet).toContain('/items');
  });

  it('includes auth in the injected snippet', async () => {
    const onInsert = vi.fn();
    render(<ApiPanel onToggle={() => {}} onInsert={onInsert} />);
    await loadSpec();

    fireEvent.change(screen.getByDisplayValue('None'), { target: { value: 'bearer' } });
    fireEvent.change(screen.getByPlaceholderText('Token'), { target: { value: 'tok123' } });

    await expandOp('List items');
    fireEvent.click(screen.getByRole('button', { name: /Inject/i }));
    const snippet = onInsert.mock.calls[0][0];
    expect(snippet).toContain('tok123');
  });
});
