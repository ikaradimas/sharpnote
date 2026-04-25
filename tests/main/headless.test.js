import { describe, it, expect } from 'vitest';

// parseArgs, applyConfigOverrides, applyParamOverrides are pure functions — test directly.
const { parseArgs, applyConfigOverrides, applyParamOverrides } = require('../../src/main/headless');

describe('headless parseArgs', () => {
  it('extracts notebook path', () => {
    const result = parseArgs(['report.cnb']);
    expect(result.notebook).toBe('report.cnb');
  });

  it('extracts --config key=value pair', () => {
    const result = parseArgs(['report.cnb', '--config', 'Env=prod']);
    expect(result.config).toEqual({ Env: 'prod' });
  });

  it('handles multiple --config flags', () => {
    const result = parseArgs([
      'report.cnb',
      '--config', 'Env=prod',
      '--config', 'ApiKey=secret123',
    ]);
    expect(result.config).toEqual({ Env: 'prod', ApiKey: 'secret123' });
  });

  it('extracts --output path', () => {
    const result = parseArgs(['report.cnb', '--output', 'results.txt']);
    expect(result.output).toBe('results.txt');
  });

  it('extracts --format', () => {
    const result = parseArgs(['report.cnb', '--format', 'json']);
    expect(result.format).toBe('json');
  });

  it('defaults format to text', () => {
    const result = parseArgs(['report.cnb']);
    expect(result.format).toBe('text');
  });

  it('handles config value containing =', () => {
    const result = parseArgs(['nb.cnb', '--config', 'ConnStr=Server=localhost;Port=5432']);
    expect(result.config).toEqual({ ConnStr: 'Server=localhost;Port=5432' });
  });

  it('returns null notebook when none provided', () => {
    const result = parseArgs(['--config', 'A=1']);
    expect(result.notebook).toBeNull();
  });

  it('ignores unknown flags gracefully', () => {
    const result = parseArgs(['report.cnb', '--verbose', '--config', 'X=1']);
    expect(result.notebook).toBe('report.cnb');
    expect(result.config).toEqual({ X: '1' });
  });

  it('handles --config without a following value (end of args)', () => {
    const result = parseArgs(['report.cnb', '--config']);
    expect(result.notebook).toBe('report.cnb');
    expect(result.config).toEqual({});
  });

  it('handles all options together', () => {
    const result = parseArgs([
      'my/notebook.cnb',
      '--config', 'A=1',
      '--output', 'out.json',
      '--format', 'json',
      '--config', 'B=2',
    ]);
    expect(result.notebook).toBe('my/notebook.cnb');
    expect(result.config).toEqual({ A: '1', B: '2' });
    expect(result.output).toBe('out.json');
    expect(result.format).toBe('json');
  });
});

describe('headless applyConfigOverrides', () => {
  it('updates existing config entry', () => {
    const config = [{ key: 'Env', value: 'dev', type: 'text' }];
    const result = applyConfigOverrides(config, { Env: 'prod' });
    expect(result).toEqual([{ key: 'Env', value: 'prod', type: 'text' }]);
  });

  it('adds new config entry when key does not exist', () => {
    const config = [{ key: 'Env', value: 'dev', type: 'text' }];
    const result = applyConfigOverrides(config, { ApiKey: 'abc' });
    expect(result).toHaveLength(2);
    expect(result[1]).toEqual({ key: 'ApiKey', value: 'abc', type: 'text' });
  });

  it('handles null/undefined config gracefully', () => {
    const result = applyConfigOverrides(null, { A: '1' });
    expect(result).toEqual([{ key: 'A', value: '1', type: 'text' }]);
  });

  it('does not mutate the original config array', () => {
    const config = [{ key: 'X', value: '1', type: 'text' }];
    applyConfigOverrides(config, { X: '2' });
    expect(config[0].value).toBe('1');
  });
});

describe('headless --param', () => {
  it('parseArgs extracts repeatable --param flags', () => {
    const result = parseArgs([
      'nb.cnb',
      '--param', 'Threshold=0.7',
      '--param', 'Region=US',
    ]);
    expect(result.params).toEqual({ Threshold: '0.7', Region: 'US' });
  });

  it('applyParamOverrides coerces values to declared types', () => {
    const params = [
      { name: 'Threshold', type: 'double', default: 0.5 },
      { name: 'Tries',     type: 'int',    default: 3   },
      { name: 'Dry',       type: 'bool',   default: false },
      { name: 'Label',     type: 'string', default: 'foo' },
    ];
    const { entries } = applyParamOverrides(params, {
      Threshold: '0.9', Tries: '5', Dry: 'true', Label: 'bar',
    });
    expect(entries[0].value).toBe(0.9);
    expect(entries[1].value).toBe(5);
    expect(entries[2].value).toBe(true);
    expect(entries[3].value).toBe('bar');
  });

  it('applyParamOverrides errors on unknown param name', () => {
    const result = applyParamOverrides([{ name: 'A', type: 'string', default: '' }], { B: 'x' });
    expect(result.error).toMatch(/Unknown --param "B"/);
  });
});
