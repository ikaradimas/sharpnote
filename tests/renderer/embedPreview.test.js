import { describe, it, expect } from 'vitest';
import { decodeEmbeddedContent, embedPreviewLines, uniqueEmbedName } from '../../src/utils.js';

// Encode a JS string as UTF-8 base64, mirroring how binary/text entries store content.
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

describe('decodeEmbeddedContent', () => {
  it('returns text content unchanged (uncapped) for small text', () => {
    const { text, capped } = decodeEmbeddedContent({ encoding: 'text', content: 'hello\nworld' });
    expect(text).toBe('hello\nworld');
    expect(capped).toBe(false);
  });

  it('decodes base64 content as UTF-8', () => {
    const { text, capped } = decodeEmbeddedContent({ encoding: 'base64', content: b64('café\nnaïve') });
    expect(text).toBe('café\nnaïve');
    expect(capped).toBe(false);
  });

  it('caps text content at maxBytes and flags capped', () => {
    const { text, capped } = decodeEmbeddedContent({ encoding: 'text', content: 'x'.repeat(100) }, 10);
    expect(text).toHaveLength(10);
    expect(capped).toBe(true);
  });

  it('returns null text for undecodable base64', () => {
    expect(decodeEmbeddedContent({ encoding: 'base64', content: '@@@bad@@@' }).text).toBeNull();
  });

  it('treats missing/empty content as empty text', () => {
    expect(decodeEmbeddedContent(null).text).toBe('');
    expect(decodeEmbeddedContent({ encoding: 'text' }).text).toBe('');
  });
});

describe('embedPreviewLines', () => {
  it('returns the first maxLines lines of text content and flags truncation', () => {
    const content = Array.from({ length: 250 }, (_, i) => `line ${i}`).join('\n');
    const { binary, lines, truncated } = embedPreviewLines({ encoding: 'text', content }, 100);
    expect(binary).toBe(false);
    expect(lines).toHaveLength(100);
    expect(lines[0]).toBe('line 0');
    expect(lines[99]).toBe('line 99');
    expect(truncated).toBe(true);
  });

  it('is not truncated when content fits', () => {
    const { lines, truncated } = embedPreviewLines({ encoding: 'text', content: 'a\nb\nc' }, 100);
    expect(lines).toEqual(['a', 'b', 'c']);
    expect(truncated).toBe(false);
  });

  it('decodes base64 text before slicing', () => {
    const { binary, lines } = embedPreviewLines({ encoding: 'base64', content: b64('one\ntwo\nthree') }, 2);
    expect(binary).toBe(false);
    expect(lines).toEqual(['one', 'two']);
  });

  it('flags NUL-containing content as binary', () => {
    const { binary, lines } = embedPreviewLines({ encoding: 'base64', content: b64('PNG\0\0data') });
    expect(binary).toBe(true);
    expect(lines).toEqual([]);
  });

  it('flags undecodable base64 as binary', () => {
    expect(embedPreviewLines({ encoding: 'base64', content: '@@@bad@@@' }).binary).toBe(true);
  });

  it('marks truncated when capped by the byte budget even under maxLines', () => {
    const { binary, lines, truncated } = embedPreviewLines({ encoding: 'text', content: 'x'.repeat(500) }, 100, 50);
    expect(binary).toBe(false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveLength(50);
    expect(truncated).toBe(true);
  });
});

describe('uniqueEmbedName', () => {
  it('sanitises unsafe characters to underscores', () => {
    expect(uniqueEmbedName('my file-2', [])).toBe('my_file_2');
  });

  it('falls back to "file" for empty / all-unsafe names', () => {
    expect(uniqueEmbedName('', [])).toBe('file');
    expect(uniqueEmbedName('!!!', [])).toBe('file');
  });

  it('trims stray leading/trailing underscores', () => {
    expect(uniqueEmbedName('.hidden', [])).toBe('hidden');
  });

  it('suffixes _2, _3, … on collision', () => {
    expect(uniqueEmbedName('data', ['data'])).toBe('data_2');
    expect(uniqueEmbedName('data', ['data', 'data_2'])).toBe('data_3');
  });

  it('returns the clean name when there is no collision', () => {
    expect(uniqueEmbedName('report', ['other'])).toBe('report');
  });
});
