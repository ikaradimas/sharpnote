import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { marked } from 'marked';
import { MarkdownOutput } from '../../src/components/output/MarkdownOutput.jsx';

// Override the global marked mock with a vi.fn() so individual tests can control its output.
vi.mock('marked', () => ({
  marked: { parse: vi.fn((s) => `<p>${String(s)}</p>`) },
}));

const mockMermaidRender = vi.hoisted(() => vi.fn());
vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: mockMermaidRender },
}));

// ── Rendering ──────────────────────────────────────────────────────────────────

describe('MarkdownOutput — rendering', () => {
  beforeEach(() => {
    vi.mocked(marked.parse).mockImplementation((s) => `<p>${String(s)}</p>`);
    mockMermaidRender.mockReset();
  });

  it('renders with output-markdown and markdown-view classes', () => {
    const { container } = render(<MarkdownOutput content="hello" />);
    expect(container.firstChild).toHaveClass('output-markdown', 'markdown-view');
  });

  it('sets innerHTML from marked.parse output', () => {
    vi.mocked(marked.parse).mockReturnValue('<strong>bold</strong>');
    const { container } = render(<MarkdownOutput content="**bold**" />);
    expect(container.innerHTML).toContain('<strong>bold</strong>');
  });

  it('renders empty when content is falsy', () => {
    const { container } = render(<MarkdownOutput content="" />);
    expect(container.firstChild.innerHTML).toBe('');
  });

  it('passes content through marked.parse (via applyMath)', () => {
    render(<MarkdownOutput content="plain text" />);
    expect(vi.mocked(marked.parse)).toHaveBeenCalledWith(
      expect.stringContaining('plain text')
    );
  });

  it('memoizes — marked.parse not called again on re-render with same content', () => {
    vi.mocked(marked.parse).mockReturnValue('<p>same</p>');
    const { rerender } = render(<MarkdownOutput content="same" />);
    const callCount = vi.mocked(marked.parse).mock.calls.length;
    rerender(<MarkdownOutput content="same" />);
    expect(vi.mocked(marked.parse).mock.calls.length).toBe(callCount);
  });

  it('re-renders when content changes', () => {
    vi.mocked(marked.parse).mockReturnValue('<p>first</p>');
    const { rerender, container } = render(<MarkdownOutput content="first" />);
    expect(container.innerHTML).toContain('first');
    vi.mocked(marked.parse).mockReturnValue('<p>second</p>');
    rerender(<MarkdownOutput content="second" />);
    expect(container.innerHTML).toContain('second');
  });
});

// ── Mermaid ────────────────────────────────────────────────────────────────────

describe('MarkdownOutput — mermaid rendering', () => {
  beforeEach(() => {
    vi.mocked(marked.parse).mockImplementation((s) => `<p>${String(s)}</p>`);
    mockMermaidRender.mockReset();
  });

  it('replaces mermaid code block with SVG on success', async () => {
    vi.mocked(marked.parse).mockReturnValue(
      '<pre><code class="language-mermaid">graph TD; A-->B</code></pre>'
    );
    mockMermaidRender.mockResolvedValue({ svg: '<svg>test-chart</svg>' });
    const { container } = render(
      <MarkdownOutput content={'```mermaid\ngraph TD; A-->B\n```'} />
    );
    await act(async () => { await Promise.resolve(); });
    const wrapper = container.querySelector('.mermaid-render');
    expect(wrapper).toBeInTheDocument();
    expect(wrapper.innerHTML).toContain('test-chart');
  });

  it('shows error message when mermaid.render rejects', async () => {
    vi.mocked(marked.parse).mockReturnValue(
      '<pre><code class="language-mermaid">bad syntax</code></pre>'
    );
    mockMermaidRender.mockRejectedValue(new Error('parse failed'));
    const { container } = render(
      <MarkdownOutput content={'```mermaid\nbad syntax\n```'} />
    );
    await act(async () => { await Promise.resolve(); });
    const errWrapper = container.querySelector('.mermaid-error');
    expect(errWrapper).toBeInTheDocument();
    expect(errWrapper.textContent).toContain('parse failed');
  });

  it('does not call mermaid.render when no mermaid blocks present', async () => {
    vi.mocked(marked.parse).mockReturnValue('<p>no diagrams here</p>');
    render(<MarkdownOutput content="no diagrams here" />);
    await act(async () => { await Promise.resolve(); });
    expect(mockMermaidRender).not.toHaveBeenCalled();
  });
});
