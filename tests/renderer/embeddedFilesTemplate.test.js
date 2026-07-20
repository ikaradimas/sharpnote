import { describe, it, expect } from 'vitest';
import { createNotebook, NOTEBOOK_TEMPLATES } from '../../src/notebook-factory.js';

describe('Embedded Files template', () => {
  it('is registered in the New Notebook dialog', () => {
    const entry = NOTEBOOK_TEMPLATES.find((t) => t.key === 'embedded-files');
    expect(entry).toBeTruthy();
    expect(entry.label).toBe('Embedded Files');
    expect(entry.description).toMatch(/read/i);
  });

  it('creates a notebook with cells and unique cell ids', () => {
    const nb = createNotebook('embedded-files');
    expect(nb.cells.length).toBeGreaterThan(5);
    const ids = nb.cells.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length); // no collisions
    expect(nb.cells.some((c) => c.type === 'markdown')).toBe(true);
    expect(nb.cells.some((c) => c.type === 'code')).toBe(true);
  });

  it('demonstrates the write, read, and update Files APIs', () => {
    const code = createNotebook('embedded-files')
      .cells.filter((c) => c.type === 'code')
      .map((c) => c.content)
      .join('\n');
    // write
    expect(code).toContain('Files.EmbedText(');
    expect(code).toContain('Files.Embed(');
    // read
    expect(code).toContain('.ContentAsText');
    expect(code).toContain('.ContentCsv');
    expect(code).toContain('.OpenRead()');
    // manage
    expect(code).toContain('Files.List()');
    expect(code).toContain('Files.Exists(');
  });

  it('starts with no embedded files (they are created by running the cells)', () => {
    const nb = createNotebook('embedded-files');
    expect(nb.embeddedFiles).toEqual([]);
  });
});
