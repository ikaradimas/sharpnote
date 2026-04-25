import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ApiEditorPanel } from '../../src/components/panels/ApiEditorPanel.jsx';

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  window.electronAPI = {
    loadApiSaved:   vi.fn().mockResolvedValue([]),
    saveApiSaved:   vi.fn(),
    exportOpenApi:  vi.fn(),
    startMockServer: vi.fn().mockResolvedValue({ success: true, port: 3000 }),
    stopMockServer:  vi.fn().mockResolvedValue({ success: true }),
  };
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ApiEditorPanel', () => {
  it('renders title, version, and base URL inputs', () => {
    render(<ApiEditorPanel onToggle={vi.fn()} />);

    expect(screen.getByPlaceholderText('API Title')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('1.0.0')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('http://localhost:3000')).toBeInTheDocument();
  });

  it('renders description input', () => {
    render(<ApiEditorPanel onToggle={vi.fn()} />);
    expect(screen.getByPlaceholderText('API description')).toBeInTheDocument();
  });

  it('"New" button resets the form', async () => {
    render(<ApiEditorPanel onToggle={vi.fn()} />);

    // Type a title first
    const titleInput = screen.getByPlaceholderText('API Title');
    fireEvent.change(titleInput, { target: { value: 'My API' } });
    expect(titleInput.value).toBe('My API');

    // Click New
    fireEvent.click(screen.getByTitle('New API'));

    // Title should be reset
    await waitFor(() => {
      expect(screen.getByPlaceholderText('API Title').value).toBe('');
    });
  });

  it('"+ Model" button adds a model', () => {
    render(<ApiEditorPanel onToggle={vi.fn()} />);

    // Initially shows empty state
    expect(screen.getByText('No models defined')).toBeInTheDocument();

    // Button text is now "Model" with a Plus icon (SVG) — match text content
    const addModelBtns = screen.getAllByText(/Model/);
    const addModelBtn = addModelBtns.find(el => el.classList.contains('api-ed-add-btn-inline'));
    fireEvent.click(addModelBtn);

    // Empty state should be gone
    expect(screen.queryByText('No models defined')).not.toBeInTheDocument();
  });

  it('"+ Controller" button adds a controller', () => {
    render(<ApiEditorPanel onToggle={vi.fn()} />);

    expect(screen.getByText(/No controllers/)).toBeInTheDocument();

    const addCtrlBtns = screen.getAllByText(/Controller/);
    const addCtrlBtn = addCtrlBtns.find(el => el.classList.contains('api-ed-add-btn-inline'));
    fireEvent.click(addCtrlBtn);

    expect(screen.queryByText(/No controllers/)).not.toBeInTheDocument();
  });

  it('Save button calls saveApiSaved', () => {
    render(<ApiEditorPanel onToggle={vi.fn()} />);

    fireEvent.click(screen.getByTitle('Save'));

    expect(window.electronAPI.saveApiSaved).toHaveBeenCalled();
  });

  it('renders export and mock server buttons', () => {
    render(<ApiEditorPanel onToggle={vi.fn()} />);

    expect(screen.getByText(/Export/)).toBeInTheDocument();
    expect(screen.getByText(/Mock Server/)).toBeInTheDocument();
  });

  it('loads saved APIs on mount', async () => {
    const saved = [{ id: 'a1', type: 'editor', title: 'Test API', version: '1.0.0', baseUrl: '', description: '', controllers: [], models: [] }];
    window.electronAPI.loadApiSaved.mockResolvedValue(saved);

    render(<ApiEditorPanel onToggle={vi.fn()} />);

    await waitFor(() => {
      expect(window.electronAPI.loadApiSaved).toHaveBeenCalled();
    });
  });

  it('export menu shows JSON and YAML options when clicked', async () => {
    render(<ApiEditorPanel onToggle={vi.fn()} />);

    fireEvent.click(screen.getByText(/Export ▾/));

    await waitFor(() => {
      expect(screen.getByText('OpenAPI JSON')).toBeInTheDocument();
      expect(screen.getByText('OpenAPI YAML')).toBeInTheDocument();
    });
  });
});
