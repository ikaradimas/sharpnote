import { describe, it, expect, beforeAll, afterEach } from 'vitest';

let buildRoutes, matchRoute, startMockServer, stopMockServer, executeHandler;

beforeAll(async () => {
  const mod = await import('../../src/main/mock-server.js');
  buildRoutes = mod.buildRoutes;
  matchRoute = mod.matchRoute;
  startMockServer = mod.startMockServer;
  stopMockServer = mod.stopMockServer;
  executeHandler = mod.executeHandler;
});

afterEach(() => {
  stopMockServer();
});

// ── buildRoutes ──────────────────────────────────────────────────────────────

describe('buildRoutes', () => {
  it('converts API def to route array with regex patterns', () => {
    const apiDef = {
      controllers: [{
        basePath: '/api',
        endpoints: [
          { method: 'get', path: '/users', summary: 'List users' },
          { method: 'post', path: '/users', summary: 'Create user' },
        ],
      }],
    };
    const routes = buildRoutes(apiDef);
    expect(routes).toHaveLength(2);
    expect(routes[0].method).toBe('GET');
    expect(routes[0].regex).toBeInstanceOf(RegExp);
    expect(routes[0].summary).toBe('List users');
    expect(routes[1].method).toBe('POST');
  });

  it('extracts path parameter names from {param} syntax', () => {
    const apiDef = {
      controllers: [{
        basePath: '/api',
        endpoints: [{ method: 'get', path: '/users/{userId}/posts/{postId}' }],
      }],
    };
    const routes = buildRoutes(apiDef);
    expect(routes[0].keys).toEqual(['userId', 'postId']);
    expect('/api/users/42/posts/99').toMatch(routes[0].regex);
  });

  it('skips endpoints with no resulting path', () => {
    const apiDef = {
      controllers: [{ basePath: '', endpoints: [{ method: 'get', path: '' }] }],
    };
    expect(buildRoutes(apiDef)).toEqual([]);
  });

  it('defaults method to GET', () => {
    const apiDef = {
      controllers: [{ basePath: '', endpoints: [{ path: '/health' }] }],
    };
    expect(buildRoutes(apiDef)[0].method).toBe('GET');
  });
});

// ── matchRoute ───────────────────────────────────────────────────────────────

describe('matchRoute', () => {
  const apiDef = {
    controllers: [{
      basePath: '/api',
      endpoints: [
        { method: 'get', path: '/users' },
        { method: 'get', path: '/users/{id}' },
        { method: 'post', path: '/users' },
        { method: 'delete', path: '/users/{id}' },
      ],
    }],
  };
  let routes;

  beforeAll(() => {
    // Re-import not needed here since buildRoutes is already loaded
    routes = buildRoutes(apiDef);
  });

  it('matches exact paths', () => {
    const result = matchRoute(routes, 'GET', '/api/users');
    expect(result).not.toBeNull();
    expect(result.params).toEqual({});
  });

  it('extracts path parameters', () => {
    const result = matchRoute(routes, 'GET', '/api/users/42');
    expect(result).not.toBeNull();
    expect(result.params).toEqual({ id: '42' });
  });

  it('returns null for non-matching paths', () => {
    expect(matchRoute(routes, 'GET', '/api/orders')).toBeNull();
    expect(matchRoute(routes, 'GET', '/other')).toBeNull();
  });

  it('matches correct HTTP method', () => {
    const getResult = matchRoute(routes, 'GET', '/api/users');
    expect(getResult).not.toBeNull();

    const postResult = matchRoute(routes, 'POST', '/api/users');
    expect(postResult).not.toBeNull();

    const deleteResult = matchRoute(routes, 'DELETE', '/api/users/5');
    expect(deleteResult).not.toBeNull();

    // PUT not defined
    expect(matchRoute(routes, 'PUT', '/api/users')).toBeNull();
  });
});

// ── Mock server integration ──────────────────────────────────────────────────

describe('mock server', () => {
  const apiDef = {
    controllers: [{
      basePath: '/api',
      endpoints: [
        {
          method: 'get',
          path: '/hello',
          mockResponse: { status: 200, body: '{"message":"hello"}' },
        },
        {
          method: 'get',
          path: '/users/{id}',
          mockResponse: { status: 200, body: '{"id":"{{id}}","name":"User {{id}}"}' },
        },
        {
          method: 'post',
          path: '/items',
          // No mockResponse configured
        },
      ],
    }],
  };

  it('starts and stops without error', async () => {
    const { port } = await startMockServer(apiDef, 0);
    expect(port).toBeGreaterThan(0);
    stopMockServer();
  });

  it('returns 404 for unknown routes', async () => {
    const { port } = await startMockServer(apiDef, 0);
    const res = await fetch(`http://127.0.0.1:${port}/api/nonexistent`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('No matching route');
  });

  it('returns 501 for routes without mock response', async () => {
    const { port } = await startMockServer(apiDef, 0);
    const res = await fetch(`http://127.0.0.1:${port}/api/items`, { method: 'POST' });
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe('No mock response configured');
  });

  it('returns configured mock response with status and body', async () => {
    const { port } = await startMockServer(apiDef, 0);
    const res = await fetch(`http://127.0.0.1:${port}/api/hello`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('hello');
  });

  it('substitutes {{param}} in response body', async () => {
    const { port } = await startMockServer(apiDef, 0);
    const res = await fetch(`http://127.0.0.1:${port}/api/users/42`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('42');
    expect(body.name).toBe('User 42');
  });

  it('sets CORS headers', async () => {
    const { port } = await startMockServer(apiDef, 0);
    const res = await fetch(`http://127.0.0.1:${port}/api/hello`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('handles OPTIONS preflight', async () => {
    const { port } = await startMockServer(apiDef, 0);
    const res = await fetch(`http://127.0.0.1:${port}/api/hello`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
  });
});

// ── executeHandler ──────────────────────────────────────────────────────────

describe('executeHandler', () => {
  const reqCtx = { params: { id: '42' }, query: { q: 'test' }, body: {}, headers: {}, method: 'GET' };

  it('returns structured { status, body } when handler returns them', () => {
    const code = 'return { status: 201, body: { created: true } };';
    const result = executeHandler(code, reqCtx);
    expect(result.status).toBe(201);
    expect(JSON.parse(result.body)).toEqual({ created: true });
  });

  it('returns 200 with serialised JSON when handler returns a plain value', () => {
    const code = 'return [1, 2, 3];';
    const result = executeHandler(code, reqCtx);
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual([1, 2, 3]);
  });

  it('provides req.params, req.query, req.method to the handler', () => {
    const code = 'return { id: req.params.id, q: req.query.q, m: req.method };';
    const result = executeHandler(code, reqCtx);
    expect(JSON.parse(result.body)).toEqual({ id: '42', q: 'test', m: 'GET' });
  });

  it('returns empty object for null/undefined return', () => {
    const result = executeHandler('// nothing', reqCtx);
    expect(result.status).toBe(200);
    expect(result.body).toBe('{}');
  });

  it('returns string body as-is when handler returns a string', () => {
    const result = executeHandler('return "hello";', reqCtx);
    expect(result.body).toBe('hello');
  });

  it('passes custom headers through from structured response', () => {
    const code = 'return { status: 200, headers: { "X-Custom": "yes" }, body: {} };';
    const result = executeHandler(code, reqCtx);
    expect(result.headers['X-Custom']).toBe('yes');
  });
});

// ── mock handler integration ────────────────────────────────────────────────

describe('mock handler integration', () => {
  const apiDef = {
    controllers: [{
      basePath: '/api',
      endpoints: [
        {
          method: 'get',
          path: '/greet/{name}',
          mockHandler: 'return { status: 200, body: { greeting: "Hello " + req.params.name } };',
        },
        {
          method: 'post',
          path: '/echo',
          mockHandler: 'return req.body;',
        },
        {
          method: 'get',
          path: '/error',
          mockHandler: 'throw new Error("broken");',
        },
        {
          method: 'get',
          path: '/static',
          mockResponse: { status: 200, body: '{"source":"static"}' },
        },
        {
          method: 'get',
          path: '/both',
          mockHandler: 'return { body: { source: "handler" } };',
          mockResponse: { status: 200, body: '{"source":"static"}' },
        },
      ],
    }],
  };

  it('executes handler with path params', async () => {
    const { port } = await startMockServer(apiDef, 0);
    const res = await fetch(`http://127.0.0.1:${port}/api/greet/World`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.greeting).toBe('Hello World');
  });

  it('passes parsed request body to handler', async () => {
    const { port } = await startMockServer(apiDef, 0);
    const res = await fetch(`http://127.0.0.1:${port}/api/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });
    const body = await res.json();
    expect(body.message).toBe('hi');
  });

  it('returns 500 when handler throws', async () => {
    const { port } = await startMockServer(apiDef, 0);
    const res = await fetch(`http://127.0.0.1:${port}/api/error`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Handler error');
    expect(body.message).toBe('broken');
  });

  it('falls back to static mockResponse when no handler', async () => {
    const { port } = await startMockServer(apiDef, 0);
    const res = await fetch(`http://127.0.0.1:${port}/api/static`);
    const body = await res.json();
    expect(body.source).toBe('static');
  });

  it('handler takes priority over static mockResponse', async () => {
    const { port } = await startMockServer(apiDef, 0);
    const res = await fetch(`http://127.0.0.1:${port}/api/both`);
    const body = await res.json();
    expect(body.source).toBe('handler');
  });
});
