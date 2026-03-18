import { describe, it, expect, vi, beforeAll } from 'vitest';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('[]'),
  };
});

let resolveLibraryPath;

beforeAll(async () => {
  process.env.VITEST = '1';
  const main = await import('../../main.js');
  resolveLibraryPath = main.resolveLibraryPath;
});

// The library dir is: /tmp/polyglot-test-docs/Polyglot Notebooks/Library
const LIBRARY_DIR = '/tmp/polyglot-test-docs/Polyglot Notebooks/Library';

describe('resolveLibraryPath', () => {
  it('resolves a relative path inside the library dir', () => {
    const result = resolveLibraryPath('snippets/foo.cs');
    expect(result).toBe(`${LIBRARY_DIR}/snippets/foo.cs`);
  });

  it('resolves a bare filename inside the library dir', () => {
    const result = resolveLibraryPath('helper.cs');
    expect(result).toBe(`${LIBRARY_DIR}/helper.cs`);
  });

  it('returns null for path traversal with ../', () => {
    const result = resolveLibraryPath('../escape.cs');
    expect(result).toBeNull();
  });

  it('returns null for absolute path outside library', () => {
    const result = resolveLibraryPath('/etc/passwd');
    expect(result).toBeNull();
  });

  it('allows absolute path inside library dir', () => {
    const inside = `${LIBRARY_DIR}/sub/file.cs`;
    const result = resolveLibraryPath(inside);
    expect(result).toBe(inside);
  });

  it('returns null for encoded traversal', () => {
    const result = resolveLibraryPath('sub/../../escape.txt');
    expect(result).toBeNull();
  });
});
