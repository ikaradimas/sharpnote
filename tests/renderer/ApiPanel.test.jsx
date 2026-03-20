import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ApiPanel } from '../../src/components/panels/ApiPanel.jsx';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OPENAPI3_SPEC = {
  openapi: '3.0.3',
  info: { title: 'Pet Store', version: '1.0.0', description: 'A sample API' },
  servers: [{ url: 'https://api.example.com/v1' }],
  paths: {
    '/pets': {
      get: { tags: ['pets'], summary: 'List pets', parameters: [
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer' }, description: 'Max records to return' },
      ], responses: { '200': { description: 'OK' }, '400': { description: 'Bad request' } } },
      post: { tags: ['pets'], summary: 'Create pet', requestBody: {
        required: true, content: { 'application/json': {} },
      }, responses: { '201': { description: 'Created' } } },
    },
    '/pets/{id}': {
      delete: { tags: ['pets'], summary: 'Delete pet', parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      ], responses: { '204': { description: 'No content' }, '404': { description: 'Not found' } } },
    },
    '/health': {
      get: { summary: 'Health check', responses: { '200': { description: 'Healthy' } } },
    },
  },
};

const SWAGGER2_SPEC = {
  swagger: '2.0',
  info: { title: 'Legacy API', version: '0.1' },
  host: 'api.old.example.com',
  basePath: '/v2',
  schemes: ['https'],
  paths: {
    '/users': {
      get: { tags: ['users'], summary: 'Get users', responses: { '200': { description: 'OK' } } },
    },
  },
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  window.electronAPI = {
    fetchUrl: vi.fn(),
  };
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ApiPanel', () => {
  it('renders the URL input and Load button', () => {
    render(<ApiPanel onToggle={() => {}} />);
    expect(screen.getByPlaceholderText(/openapi/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load' })).toBeInTheDocument();
  });

  it('Load button is disabled when URL is empty', () => {
    render(<ApiPanel onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: 'Load' })).toBeDisabled();
  });

  it('Load button becomes enabled when URL is typed', () => {
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
      target: { value: 'https://example.com/api.json' },
    });
    expect(screen.getByRole('button', { name: 'Load' })).not.toBeDisabled();
  });

  it('fetches and displays an OpenAPI 3 spec', async () => {
    window.electronAPI.fetchUrl.mockResolvedValue(JSON.stringify(OPENAPI3_SPEC));
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
      target: { value: 'https://example.com/api.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => {
      expect(screen.getByText('Pet Store')).toBeInTheDocument();
    });
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText(/OAS 3.0.3/)).toBeInTheDocument();
    expect(screen.getByText('https://api.example.com/v1')).toBeInTheDocument();
  });

  it('displays endpoints grouped by tag', async () => {
    window.electronAPI.fetchUrl.mockResolvedValue(JSON.stringify(OPENAPI3_SPEC));
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
      target: { value: 'https://example.com/api.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => screen.getByText('Pet Store'));

    // Tag groups
    expect(screen.getByText('pets')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('shows method badges for operations', async () => {
    window.electronAPI.fetchUrl.mockResolvedValue(JSON.stringify(OPENAPI3_SPEC));
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
      target: { value: 'https://example.com/api.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));

    await waitFor(() => screen.getByText('Pet Store'));
    expect(screen.getAllByText('GET').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('DELETE')).toBeInTheDocument();
  });

  it('expands an operation to show parameters on click', async () => {
    window.electronAPI.fetchUrl.mockResolvedValue(JSON.stringify(OPENAPI3_SPEC));
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
      target: { value: 'https://example.com/api.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => screen.getByText('Pet Store'));

    // Click the GET /pets operation
    fireEvent.click(screen.getByText('List pets'));
    expect(screen.getByText('limit')).toBeInTheDocument();
    expect(screen.getByText('Max records to return')).toBeInTheDocument();
  });

  it('shows response codes in expanded operation', async () => {
    window.electronAPI.fetchUrl.mockResolvedValue(JSON.stringify(OPENAPI3_SPEC));
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
      target: { value: 'https://example.com/api.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => screen.getByText('Pet Store'));

    fireEvent.click(screen.getByText('List pets'));
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('handles YAML specs', async () => {
    const yamlSpec = `openapi: "3.0.0"\ninfo:\n  title: YAML API\n  version: "2.0"\npaths: {}`;
    window.electronAPI.fetchUrl.mockResolvedValue(yamlSpec);
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
      target: { value: 'https://example.com/api.yaml' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => screen.getByText('YAML API'));
  });

  it('shows an error when fetch fails', async () => {
    window.electronAPI.fetchUrl.mockRejectedValue(new Error('Network error'));
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
      target: { value: 'https://bad.example.com/api.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => screen.getByText(/Network error/));
  });

  it('shows an error for non-OpenAPI JSON', async () => {
    window.electronAPI.fetchUrl.mockResolvedValue('{"foo":"bar"}');
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
      target: { value: 'https://example.com/api.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => screen.getByText(/No OpenAPI\/Swagger spec detected/));
  });

  it('displays Swagger 2.0 specs with correct metadata', async () => {
    window.electronAPI.fetchUrl.mockResolvedValue(JSON.stringify(SWAGGER2_SPEC));
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
      target: { value: 'https://example.com/swagger.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => screen.getByText('Legacy API'));
    expect(screen.getByText(/Swagger 2.0/)).toBeInTheDocument();
    expect(screen.getByText('https://api.old.example.com/v2')).toBeInTheDocument();
  });

  it('collapses and expands tag groups on click', async () => {
    window.electronAPI.fetchUrl.mockResolvedValue(JSON.stringify(OPENAPI3_SPEC));
    render(<ApiPanel onToggle={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/openapi/i), {
      target: { value: 'https://example.com/api.json' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => screen.getByText('Pet Store'));

    // Initially expanded — 'List pets' should be visible
    expect(screen.getByText('List pets')).toBeInTheDocument();

    // Collapse the pets tag
    fireEvent.click(screen.getByText('pets'));
    expect(screen.queryByText('List pets')).not.toBeInTheDocument();

    // Expand again
    fireEvent.click(screen.getByText('pets'));
    expect(screen.getByText('List pets')).toBeInTheDocument();
  });

  it('triggers Enter key to load spec', async () => {
    window.electronAPI.fetchUrl.mockResolvedValue(JSON.stringify(OPENAPI3_SPEC));
    render(<ApiPanel onToggle={() => {}} />);
    const input = screen.getByPlaceholderText(/openapi/i);
    fireEvent.change(input, { target: { value: 'https://example.com/api.json' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => screen.getByText('Pet Store'));
  });
});
