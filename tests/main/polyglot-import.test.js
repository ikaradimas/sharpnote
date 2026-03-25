'use strict';

import { describe, it, expect } from 'vitest';
import { parseDib, parseIpynb } from '../../src/main/polyglot-import.js';

// ── parseDib ──────────────────────────────────────────────────────────────────

describe('parseDib', () => {
  it('parses markdown and C# cells', () => {
    const dib = `#!meta
{"kernelInfo":{"defaultKernelName":"csharp"}}

#!markdown

# Hello

Some intro text.

#!csharp

var x = 42;
x.Display();
`;
    const { cells, skippedCount } = parseDib(dib);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ type: 'markdown', content: '# Hello\n\nSome intro text.' });
    expect(cells[1]).toMatchObject({ type: 'code', content: 'var x = 42;\nx.Display();' });
    expect(skippedCount).toBe(0);
  });

  it('skips non-C# code cells and counts them', () => {
    const dib = `#!fsharp

let x = 42
printfn "%d" x

#!csharp

Console.WriteLine("hi");

#!pwsh

Get-Date

#!markdown

## Done
`;
    const { cells, skippedCount } = parseDib(dib);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ type: 'code' });
    expect(cells[1]).toMatchObject({ type: 'markdown' });
    expect(skippedCount).toBe(2);
  });

  it('skips empty cells', () => {
    const dib = `#!csharp

#!markdown

# Non-empty

#!csharp

var y = 1;
`;
    const { cells } = parseDib(dib);
    expect(cells).toHaveLength(2); // empty csharp block skipped
    expect(cells[0]).toMatchObject({ type: 'markdown' });
    expect(cells[1]).toMatchObject({ type: 'code', content: 'var y = 1;' });
  });

  it('skips #!meta and #!import blocks', () => {
    const dib = `#!meta
{"kernelInfo":{}}

#!import

./other.dib

#!csharp

var z = 99;
`;
    const { cells, skippedCount } = parseDib(dib);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ type: 'code', content: 'var z = 99;' });
    expect(skippedCount).toBe(0); // #!meta and #!import are not "skipped cells", just ignored
  });

  it('returns empty cells and zero skipped for an empty file', () => {
    const { cells, skippedCount } = parseDib('');
    expect(cells).toHaveLength(0);
    expect(skippedCount).toBe(0);
  });

  it('trims leading/trailing whitespace from cell content', () => {
    const dib = `#!csharp


  var x = 1;


`;
    const { cells } = parseDib(dib);
    expect(cells[0].content).toBe('var x = 1;');
  });
});

// ── parseIpynb ────────────────────────────────────────────────────────────────

function makeIpynb(cells, kernelLang = 'csharp') {
  return JSON.stringify({
    cells,
    metadata: {
      kernelspec: { display_name: '.NET (C#)', language: kernelLang, name: '.net-csharp' },
      language_info: { name: 'polyglot-notebook' },
    },
  });
}

function codeCell(source, lang = null) {
  const meta = lang
    ? { dotnet_interactive: { language: lang }, polyglot_notebook: { kernelName: lang } }
    : {};
  return { cell_type: 'code', source: Array.isArray(source) ? source : [source], metadata: meta, outputs: [] };
}

function markdownCell(source) {
  return { cell_type: 'markdown', source: Array.isArray(source) ? source : [source], metadata: {} };
}

describe('parseIpynb', () => {
  it('parses C# code cells and markdown cells', () => {
    const nb = makeIpynb([
      markdownCell('# My Notebook\n\nIntro.'),
      codeCell('var x = 42;', 'csharp'),
    ]);
    const { cells, skippedCount } = parseIpynb(nb);
    expect(cells).toHaveLength(2);
    expect(cells[0]).toMatchObject({ type: 'markdown', content: '# My Notebook\n\nIntro.' });
    expect(cells[1]).toMatchObject({ type: 'code', content: 'var x = 42;' });
    expect(skippedCount).toBe(0);
  });

  it('skips non-C# code cells and counts them', () => {
    const nb = makeIpynb([
      codeCell('let x = 1', 'fsharp'),
      codeCell('var y = 2;', 'csharp'),
      codeCell('console.log(1)', 'javascript'),
    ]);
    const { cells, skippedCount } = parseIpynb(nb);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ type: 'code', content: 'var y = 2;' });
    expect(skippedCount).toBe(2);
  });

  it('uses notebook default language for cells without explicit lang', () => {
    // No per-cell lang metadata; notebook kernel is C#
    const nb = makeIpynb([codeCell('var x = 1;')], 'csharp');
    const { cells, skippedCount } = parseIpynb(nb);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ type: 'code' });
    expect(skippedCount).toBe(0);
  });

  it('skips cells without explicit lang in a non-C# default notebook', () => {
    const nb = makeIpynb([codeCell('x = 1')], 'python');
    const { cells, skippedCount } = parseIpynb(nb);
    expect(cells).toHaveLength(0);
    expect(skippedCount).toBe(1);
  });

  it('strips inline #!csharp shebang from cell source', () => {
    const nb = makeIpynb([codeCell('#!csharp\nvar x = 1;', 'csharp')]);
    const { cells } = parseIpynb(nb);
    expect(cells[0].content).toBe('var x = 1;');
  });

  it('detects C# via inline shebang when cell metadata is absent', () => {
    const nb = makeIpynb([codeCell('#!csharp\nvar z = 99;')], 'polyglot-notebook');
    const { cells, skippedCount } = parseIpynb(nb);
    expect(cells).toHaveLength(1);
    expect(cells[0]).toMatchObject({ type: 'code', content: 'var z = 99;' });
    expect(skippedCount).toBe(0);
  });

  it('skips non-C# inline shebang cells', () => {
    const nb = makeIpynb([codeCell('#!fsharp\nlet x = 1')], 'polyglot-notebook');
    const { cells, skippedCount } = parseIpynb(nb);
    expect(cells).toHaveLength(0);
    expect(skippedCount).toBe(1);
  });

  it('extracts title from first markdown heading', () => {
    const nb = makeIpynb([
      markdownCell('## Revenue Analysis\n\nSome text.'),
      codeCell('var x = 1;', 'csharp'),
    ]);
    const { title } = parseIpynb(nb);
    expect(title).toBe('Revenue Analysis');
  });

  it('handles source as a joined array of strings', () => {
    const nb = makeIpynb([{
      cell_type: 'code',
      source: ['var x = 1;\n', 'var y = 2;'],
      metadata: { dotnet_interactive: { language: 'csharp' } },
      outputs: [],
    }]);
    const { cells } = parseIpynb(nb);
    expect(cells[0].content).toBe('var x = 1;\nvar y = 2;');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseIpynb('not json')).toThrow('Invalid JSON');
  });

  it('throws if cells array is missing', () => {
    expect(() => parseIpynb(JSON.stringify({ metadata: {} }))).toThrow('Missing cells array');
  });

  it('accepts C# variants: "C#", ".net-csharp", ".NET (C#)"', () => {
    for (const lang of ['C#', '.net-csharp', '.NET (C#)']) {
      const nb = makeIpynb([codeCell('var x = 1;', lang)]);
      const { cells } = parseIpynb(nb);
      expect(cells).toHaveLength(1);
    }
  });
});
