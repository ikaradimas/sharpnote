import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EmbedPanel } from '../../src/components/panels/EmbedPanel.jsx';

const textFile = {
  name: 'mytext', filename: 'mytext.txt', mimeType: 'text/plain',
  encoding: 'text', content: 'alpha\nbeta\ngamma', variables: {},
};
// base64 'AAEC' decodes to bytes 0x00,0x01,0x02 — the NUL makes it binary.
const binFile = {
  name: 'blob', filename: 'blob.bin', mimeType: 'application/octet-stream',
  encoding: 'base64', content: 'AAEC', variables: {},
};

describe('EmbedPanel', () => {
  it('previews the first lines when a text file is expanded', () => {
    render(<EmbedPanel files={[textFile]} onExport={vi.fn()} />);
    expect(document.querySelector('.embed-file-preview')).toBeNull(); // collapsed
    fireEvent.click(screen.getByText('mytext'));
    const pre = document.querySelector('.embed-file-preview');
    expect(pre).toBeTruthy();
    expect(pre.textContent).toBe('alpha\nbeta\ngamma');
  });

  it('shows a binary note instead of a preview for a binary file', () => {
    render(<EmbedPanel files={[binFile]} onExport={vi.fn()} />);
    fireEvent.click(screen.getByText('blob'));
    expect(document.querySelector('.embed-file-preview')).toBeNull();
    expect(screen.getByText(/binary file/i)).toBeInTheDocument();
  });

  it('calls onExport with the file when the download button is clicked', () => {
    const onExport = vi.fn();
    render(<EmbedPanel files={[textFile]} onExport={onExport} />);
    fireEvent.click(screen.getByTitle('Export / download'));
    expect(onExport).toHaveBeenCalledWith(textFile);
  });

  it('renders no export button when onExport is absent', () => {
    render(<EmbedPanel files={[textFile]} />);
    expect(screen.queryByTitle('Export / download')).toBeNull();
  });

  it('calls onAdd when the import button is clicked', () => {
    const onAdd = vi.fn();
    render(<EmbedPanel files={[]} onAdd={onAdd} />);
    fireEvent.click(screen.getByTitle(/import file/i));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
