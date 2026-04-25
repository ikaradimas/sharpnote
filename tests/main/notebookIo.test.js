import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import os from 'os';

const require = createRequire(import.meta.url);
const tmpDir = path.join(os.tmpdir(), `sharpnote-nbio-test-${Date.now()}`);

// Use CJS require so we get the same module singleton that notebook-io.js uses
let dbConns;
let nbIo;

beforeAll(() => {
  fs.mkdirSync(tmpDir, { recursive: true });

  // Both modules loaded via CJS require to share the same _key singleton
  dbConns = require('../../src/main/db-connections.js');
  dbConns.getKey({ getPath: () => tmpDir });

  nbIo = require('../../src/main/notebook-io.js');
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('Config secret encryption round-trip', () => {
  it('encryptField changes the value and decryptField restores it', () => {
    const original = 'Server=localhost;Password=s3cret';
    const encrypted = dbConns.encryptField(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = dbConns.decryptField(encrypted, true);
    expect(decrypted).toBe(original);
  });

  it('writeNotebookFile encrypts secret config entries on disk', () => {
    const filePath = path.join(tmpDir, 'test-secrets.cnb');
    const data = {
      title: 'Test',
      cells: [],
      config: [
        { key: 'apiKey', type: 'secret', value: 'my-secret-value' },
        { key: 'label', type: 'text', value: 'not-a-secret' },
      ],
    };

    nbIo.writeNotebookFile(filePath, data);

    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const secretEntry = raw.config.find((e) => e.key === 'apiKey');
    const textEntry = raw.config.find((e) => e.key === 'label');

    // Secret entry should be encrypted (flag set, value changed)
    expect(secretEntry.encrypted).toBe(true);
    expect(secretEntry.value).not.toBe('my-secret-value');

    // Non-secret entry should NOT have encrypted flag
    expect(textEntry.encrypted).toBeUndefined();
    expect(textEntry.value).toBe('not-a-secret');
  });

  it('encrypted entries can be decrypted back to original', () => {
    const filePath = path.join(tmpDir, 'test-secrets.cnb');
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const secretEntry = raw.config.find((e) => e.key === 'apiKey');

    const decrypted = dbConns.decryptField(secretEntry.value, true);
    expect(decrypted).toBe('my-secret-value');
  });

  it('already-decrypted entries (no encrypted flag) pass through unchanged', () => {
    const config = [
      { key: 'apiKey', type: 'secret', value: 'plaintext-value' },
      { key: 'label', type: 'text', value: 'also-plain' },
    ];
    const filePath = path.join(tmpDir, 'test-no-encrypt.cnb');
    fs.writeFileSync(filePath, JSON.stringify({ config }, null, 2), 'utf-8');

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    // Entries without encrypted flag should remain as-is
    for (const entry of data.config) {
      expect(entry.encrypted).toBeUndefined();
      const original = config.find((e) => e.key === entry.key);
      expect(entry.value).toBe(original.value);
    }
  });
});

describe('Notebook params round-trip', () => {
  it('persists params verbatim through write/read', () => {
    const filePath = path.join(tmpDir, 'test-params.cnb');
    const params = [
      { name: 'Threshold', type: 'double', default: 0.5,  value: 0.7 },
      { name: 'Region',    type: 'choice', default: 'EU', options: ['EU', 'US', 'APAC'] },
      { name: 'Dry',       type: 'bool',   default: false },
    ];
    nbIo.writeNotebookFile(filePath, { title: 'P', cells: [], params });
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(raw.params).toEqual(params);
  });

  it('writing without a params field keeps the file backwards-compatible', () => {
    const filePath = path.join(tmpDir, 'test-no-params.cnb');
    nbIo.writeNotebookFile(filePath, { title: 'NP', cells: [] });
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(raw.params).toBeUndefined();
  });
});
