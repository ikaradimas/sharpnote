'use strict';

const http = require('http');

let _server = null;

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

function startMockServer(apiDef, port = 0) {
  if (_server) stopMockServer();

  const routes = buildRoutes(apiDef);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost`);
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
    if (!route.mockResponse) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No mock response configured', endpoint: route.summary, params }));
      return;
    }

    const mock = route.mockResponse;
    const headers = { 'Content-Type': 'application/json', ...(mock.headers || {}) };
    const status = mock.status || 200;

    // Substitute path params in body: {{id}} → actual value
    let body = mock.body || '{}';
    for (const [key, val] of Object.entries(params)) {
      body = body.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
    }

    res.writeHead(status, headers);
    res.end(body);
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      const actualPort = server.address().port;
      _server = server;
      resolve({ port: actualPort });
    });
    server.on('error', reject);
  });
}

function stopMockServer() {
  if (_server) {
    _server.close();
    _server = null;
  }
}

function isRunning() {
  return _server !== null;
}

function register(ipcMain) {
  ipcMain.handle('mock-server-start', async (_ev, { apiDef, port }) => {
    try {
      const result = await startMockServer(apiDef, port || 0);
      return { success: true, port: result.port };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('mock-server-stop', async () => {
    stopMockServer();
    return { success: true };
  });

  ipcMain.handle('mock-server-status', () => ({
    running: isRunning(),
    port: _server?.address()?.port ?? null,
  }));
}

module.exports = { startMockServer, stopMockServer, isRunning, buildRoutes, matchRoute, register };
