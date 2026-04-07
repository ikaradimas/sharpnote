import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

let gitOps;
const tmpDirs = [];

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sharpnote-git-test-'));
  tmpDirs.push(dir);
  return dir;
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepo() {
  const dir = makeTmpDir();
  git(dir, 'init');
  git(dir, 'config', 'user.email', 'test@test.com');
  git(dir, 'config', 'user.name', 'Test');
  return dir;
}

beforeAll(async () => {
  gitOps = await import('../../src/main/git-ops.js');
});

afterEach(() => {
  // Clean up temp dirs created during each test
});

afterAll(() => {
  for (const dir of tmpDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ── gitIsRepo ────────────────────────────────────────────────────────────────

describe('gitIsRepo', () => {
  it('returns true for a git repo', async () => {
    const dir = initRepo();
    const result = await gitOps.gitIsRepo(dir);
    expect(result.data).toBe(true);
  });

  it('returns false for a non-git directory', async () => {
    const dir = makeTmpDir();
    const result = await gitOps.gitIsRepo(dir);
    expect(result.data).toBe(false);
  });
});

// ── gitStatus ────────────────────────────────────────────────────────────────

describe('gitStatus', () => {
  it('returns branch name and empty lists for clean repo', async () => {
    const dir = initRepo();
    // Need at least one commit for branch info
    fs.writeFileSync(path.join(dir, 'init.txt'), 'init');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'initial');

    const result = await gitOps.gitStatus(dir);
    expect(result.success).toBe(true);
    expect(result.data.branch).toBeTruthy();
    expect(result.data.staged).toEqual([]);
    expect(result.data.unstaged).toEqual([]);
    expect(result.data.untracked).toEqual([]);
  });

  it('shows untracked files after creating a file', async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, 'init.txt'), 'init');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'initial');

    fs.writeFileSync(path.join(dir, 'new.txt'), 'content');
    const result = await gitOps.gitStatus(dir);
    expect(result.success).toBe(true);
    const names = result.data.untracked.map((f) => f.file);
    expect(names).toContain('new.txt');
  });
});

// ── gitStage + gitStatus ─────────────────────────────────────────────────────

describe('gitStage', () => {
  it('stages a file so it appears in staged list', async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, 'init.txt'), 'init');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'initial');

    fs.writeFileSync(path.join(dir, 'staged.txt'), 'content');
    await gitOps.gitStage(dir, ['staged.txt']);

    const result = await gitOps.gitStatus(dir);
    const stagedNames = result.data.staged.map((f) => f.file);
    expect(stagedNames).toContain('staged.txt');
  });
});

// ── gitCommit ────────────────────────────────────────────────────────────────

describe('gitCommit', () => {
  it('creates a commit', async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, 'file.txt'), 'content');
    git(dir, 'add', '.');
    const result = await gitOps.gitCommit(dir, 'test commit');
    expect(result.success).toBe(true);
  });
});

// ── gitLog ───────────────────────────────────────────────────────────────────

describe('gitLog', () => {
  it('returns commit entries', async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, 'file.txt'), 'content');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'first commit');

    const result = await gitOps.gitLog(dir, 10);
    expect(result.success).toBe(true);
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data[0].message).toBe('first commit');
    expect(result.data[0].hash).toBeTruthy();
  });
});

// ── gitBranches ──────────────────────────────────────────────────────────────

describe('gitBranches', () => {
  it('returns current branch', async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, 'file.txt'), 'content');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'init');

    const result = await gitOps.gitBranches(dir);
    expect(result.success).toBe(true);
    expect(result.data.current).toBeTruthy();
    expect(result.data.branches).toContain(result.data.current);
  });
});

// ── gitDiff ──────────────────────────────────────────────────────────────────

describe('gitDiff', () => {
  it('returns unified diff for modified file', async () => {
    const dir = initRepo();
    fs.writeFileSync(path.join(dir, 'file.txt'), 'original\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-m', 'init');

    fs.writeFileSync(path.join(dir, 'file.txt'), 'modified\n');
    const result = await gitOps.gitDiff(dir, 'file.txt');
    expect(result.success).toBe(true);
    expect(result.data).toContain('-original');
    expect(result.data).toContain('+modified');
  });
});
