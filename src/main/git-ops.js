'use strict';

const { execFile } = require('child_process');

function gitExec(cwd, args, maxBuffer = 10 * 1024 * 1024) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd, maxBuffer, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) resolve({ success: false, error: (stderr || err.message).trim(), stdout: stdout?.trim() || '' });
      else resolve({ success: true, data: stdout.trim() });
    });
  });
}

async function gitIsRepo(cwd) {
  const result = await gitExec(cwd, ['rev-parse', '--is-inside-work-tree']);
  return { success: true, data: result.success && result.data === 'true' };
}

async function gitStatus(cwd) {
  const result = await gitExec(cwd, ['status', '--porcelain=v1', '-b', '--untracked-files=normal']);
  if (!result.success) return result;

  const lines = result.data.split('\n').filter(Boolean);
  let branch = 'unknown', ahead = 0, behind = 0;
  const staged = [], unstaged = [], untracked = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      const branchInfo = line.slice(3);
      const dotDot = branchInfo.indexOf('...');
      branch = dotDot >= 0 ? branchInfo.slice(0, dotDot) : branchInfo.split(' ')[0];
      const aheadMatch = branchInfo.match(/ahead (\d+)/);
      const behindMatch = branchInfo.match(/behind (\d+)/);
      if (aheadMatch) ahead = parseInt(aheadMatch[1]);
      if (behindMatch) behind = parseInt(behindMatch[1]);
      continue;
    }

    const x = line[0]; // index (staged) status
    const y = line[1]; // worktree (unstaged) status
    const file = line.slice(3);

    if (x === '?' && y === '?') {
      untracked.push({ file, status: '?' });
    } else {
      if (x && x !== ' ' && x !== '?') staged.push({ file, status: x });
      if (y && y !== ' ' && y !== '?') unstaged.push({ file, status: y });
    }
  }

  return { success: true, data: { branch, ahead, behind, staged, unstaged, untracked } };
}

async function gitDiff(cwd, filePath, staged = false) {
  const args = staged
    ? ['diff', '--cached', '--', filePath]
    : ['diff', '--', filePath];
  return gitExec(cwd, args);
}

async function gitDiffHead(cwd, filePath) {
  return gitExec(cwd, ['diff', 'HEAD', '--', filePath]);
}

async function gitDiffCommit(cwd, hash) {
  return gitExec(cwd, ['diff', `${hash}~1`, hash]);
}

async function gitLog(cwd, count = 20) {
  const result = await gitExec(cwd, [
    'log', `--format=%H|%an|%ai|%s`, `-n`, String(count),
  ]);
  if (!result.success) return result;
  if (!result.data) return { success: true, data: [] };

  const entries = result.data.split('\n').filter(Boolean).map((line) => {
    const parts = line.split('|');
    return {
      hash: parts[0],
      author: parts[1],
      date: parts[2],
      message: parts.slice(3).join('|'),
    };
  });
  return { success: true, data: entries };
}

async function gitStage(cwd, filePaths) {
  return gitExec(cwd, ['add', '--', ...filePaths]);
}

async function gitUnstage(cwd, filePaths) {
  return gitExec(cwd, ['restore', '--staged', '--', ...filePaths]);
}

async function gitDiscard(cwd, filePaths) {
  return gitExec(cwd, ['checkout', '--', ...filePaths]);
}

async function gitCommit(cwd, message) {
  return gitExec(cwd, ['commit', '-m', message]);
}

async function gitBranches(cwd) {
  const result = await gitExec(cwd, ['branch', '--no-color']);
  if (!result.success) return result;

  let current = '';
  const branches = [];
  for (const line of result.data.split('\n').filter(Boolean)) {
    const name = line.replace(/^\*?\s+/, '').trim();
    if (line.startsWith('* ')) current = name;
    branches.push(name);
  }
  return { success: true, data: { current, branches } };
}

async function gitCheckout(cwd, branch) {
  return gitExec(cwd, ['checkout', branch]);
}

async function gitCreateBranch(cwd, branch) {
  return gitExec(cwd, ['checkout', '-b', branch]);
}

async function gitInit(cwd) {
  return gitExec(cwd, ['init']);
}

function register(ipcMain) {
  ipcMain.handle('git-is-repo',    (_ev, cwd) => gitIsRepo(cwd));
  ipcMain.handle('git-status',     (_ev, cwd) => gitStatus(cwd));
  ipcMain.handle('git-diff',        (_ev, cwd, file, staged) => gitDiff(cwd, file, staged));
  ipcMain.handle('git-diff-head',   (_ev, cwd, file) => gitDiffHead(cwd, file));
  ipcMain.handle('git-diff-commit', (_ev, cwd, hash) => gitDiffCommit(cwd, hash));
  ipcMain.handle('git-log',        (_ev, cwd, count) => gitLog(cwd, count));
  ipcMain.handle('git-stage',      (_ev, cwd, files) => gitStage(cwd, files));
  ipcMain.handle('git-unstage',    (_ev, cwd, files) => gitUnstage(cwd, files));
  ipcMain.handle('git-discard',    (_ev, cwd, files) => gitDiscard(cwd, files));
  ipcMain.handle('git-commit',     (_ev, cwd, msg) => gitCommit(cwd, msg));
  ipcMain.handle('git-branches',   (_ev, cwd) => gitBranches(cwd));
  ipcMain.handle('git-checkout',      (_ev, cwd, branch) => gitCheckout(cwd, branch));
  ipcMain.handle('git-create-branch', (_ev, cwd, branch) => gitCreateBranch(cwd, branch));
  ipcMain.handle('git-init',          (_ev, cwd) => gitInit(cwd));
}

module.exports = { gitExec, gitIsRepo, gitStatus, gitDiff, gitDiffHead, gitDiffCommit, gitLog, gitStage, gitUnstage, gitDiscard, gitCommit, gitBranches, gitCheckout, gitCreateBranch, gitInit, register };
