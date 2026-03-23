import { describe, it, expect, beforeEach } from 'vitest';
import os from 'os';
import path from 'path';
import fs from 'fs';
import settings from '../../src/main/settings.js';

// ── Constants ──────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('FONT_SIZE_MIN is 10', () => {
    expect(settings.FONT_SIZE_MIN).toBe(10);
  });

  it('FONT_SIZE_MAX is 28', () => {
    expect(settings.FONT_SIZE_MAX).toBe(28);
  });
});

// ── getFontSize / applyFontSize / resetFontSize ────────────────────────────────

describe('getFontSize', () => {
  beforeEach(() => {
    settings.resetFontSize();
  });

  it('returns the default font size after reset', () => {
    expect(settings.getFontSize()).toBeCloseTo(12.6);
  });
});

describe('applyFontSize', () => {
  beforeEach(() => {
    settings.resetFontSize();
  });

  it('increases font size by delta', () => {
    settings.applyFontSize(2);
    expect(settings.getFontSize()).toBeCloseTo(14.6);
  });

  it('decreases font size by delta', () => {
    settings.applyFontSize(-2);
    expect(settings.getFontSize()).toBeCloseTo(10.6);
  });

  it('clamps to FONT_SIZE_MAX', () => {
    settings.applyFontSize(100);
    expect(settings.getFontSize()).toBe(settings.FONT_SIZE_MAX);
  });

  it('clamps to FONT_SIZE_MIN', () => {
    settings.applyFontSize(-100);
    expect(settings.getFontSize()).toBe(settings.FONT_SIZE_MIN);
  });

  it('sends font-size-change via webContents when mainWindow is set', () => {
    const sent = [];
    const fakeWindow = { webContents: { send: (ch, val) => sent.push({ ch, val }) } };
    settings.setMainWindow(fakeWindow);
    settings.applyFontSize(1);
    settings.setMainWindow(null);
    expect(sent).toHaveLength(1);
    expect(sent[0].ch).toBe('font-size-change');
    expect(sent[0].val).toBeCloseTo(13.6);
  });

  it('does not throw when mainWindow is null', () => {
    settings.setMainWindow(null);
    expect(() => settings.applyFontSize(1)).not.toThrow();
  });
});

describe('resetFontSize', () => {
  it('resets to 12.6 after a change', () => {
    settings.applyFontSize(5);
    settings.resetFontSize();
    expect(settings.getFontSize()).toBeCloseTo(12.6);
  });

  it('sends font-size-change on reset', () => {
    const sent = [];
    const fakeWindow = { webContents: { send: (ch, val) => sent.push({ ch, val }) } };
    settings.setMainWindow(fakeWindow);
    settings.resetFontSize();
    settings.setMainWindow(null);
    expect(sent).toHaveLength(1);
    expect(sent[0].val).toBeCloseTo(12.6);
  });
});

// ── loadAppSettings / saveAppSettings ─────────────────────────────────────────

describe('loadAppSettings', () => {
  it('returns default { theme: "kl1nt" } when file does not exist', () => {
    const result = settings.loadAppSettings('/nonexistent/path/app-settings.json');
    expect(result).toEqual({ theme: 'kl1nt' });
  });

  it('returns default when file contains invalid JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-settings-'));
    const p = path.join(dir, 'bad.json');
    fs.writeFileSync(p, '{ not valid json }', 'utf-8');
    const result = settings.loadAppSettings(p);
    expect(result).toEqual({ theme: 'kl1nt' });
    fs.rmSync(dir, { recursive: true });
  });

  it('parses stored JSON correctly', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-settings-'));
    const p = path.join(dir, 'app-settings.json');
    fs.writeFileSync(p, JSON.stringify({ theme: 'dark', fontSize: 14 }), 'utf-8');
    const result = settings.loadAppSettings(p);
    expect(result).toEqual({ theme: 'dark', fontSize: 14 });
    fs.rmSync(dir, { recursive: true });
  });
});

describe('saveAppSettings', () => {
  it('writes settings as pretty-printed JSON', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-settings-'));
    const p = path.join(dir, 'app-settings.json');
    settings.saveAppSettings({ theme: 'light', zoom: 1.2 }, p);
    const raw = fs.readFileSync(p, 'utf-8');
    expect(JSON.parse(raw)).toEqual({ theme: 'light', zoom: 1.2 });
    fs.rmSync(dir, { recursive: true });
  });

  it('creates parent directories if needed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-settings-'));
    const p = path.join(dir, 'nested', 'deep', 'app-settings.json');
    settings.saveAppSettings({ theme: 'kl1nt' }, p);
    expect(fs.existsSync(p)).toBe(true);
    fs.rmSync(dir, { recursive: true });
  });

  it('round-trips with loadAppSettings', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sn-settings-'));
    const p = path.join(dir, 'app-settings.json');
    const data = { theme: 'kl1nt', dockLayout: { left: [] } };
    settings.saveAppSettings(data, p);
    expect(settings.loadAppSettings(p)).toEqual(data);
    fs.rmSync(dir, { recursive: true });
  });
});
