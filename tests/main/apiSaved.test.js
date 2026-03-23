import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';

let loadApiSaved, saveApiSaved;
let tmpDir;

beforeAll(async () => {
  process.env.VITEST = '1';
  const mod = await import('../../src/main/api-saved.js');
  loadApiSaved = mod.loadApiSaved;
  saveApiSaved = mod.saveApiSaved;
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'api-saved-test-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadApiSaved', () => {
  it('returns an empty array when the file does not exist', () => {
    expect(loadApiSaved(path.join(tmpDir, 'nonexistent'))).toEqual([]);
  });

  it('parses and returns stored JSON', () => {
    const list = [{ id: 'x1', url: 'https://api.example.com', title: 'Example', auth: { type: 'none' } }];
    const dir = path.join(tmpDir, 'load-test');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'api-saved.json'), JSON.stringify(list), 'utf-8');
    expect(loadApiSaved(dir)).toEqual(list);
  });
});

describe('saveApiSaved', () => {
  it('writes JSON to the configured path', () => {
    const list = [{ id: 'a1', url: 'https://api.example.com', title: 'Example', auth: { type: 'bearer', token: 'tok' } }];
    const dir = path.join(tmpDir, 'save-test');
    saveApiSaved(list, dir);
    const written = JSON.parse(fs.readFileSync(path.join(dir, 'api-saved.json'), 'utf-8'));
    expect(written).toEqual(list);
  });

  it('round-trips through save then load', () => {
    const list = [
      { id: 'b1', url: 'https://one.example.com', title: 'One', auth: { type: 'apikey', keyName: 'X-Key', keyValue: 'secret', keyIn: 'header' } },
      { id: 'b2', url: 'https://two.example.com', title: 'Two', auth: { type: 'basic', username: 'user', password: 'pass' } },
    ];
    const dir = path.join(tmpDir, 'roundtrip-test');
    saveApiSaved(list, dir);
    expect(loadApiSaved(dir)).toEqual(list);
  });
});
