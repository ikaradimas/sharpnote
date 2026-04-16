import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// Recursively find all .jsx files under a directory
function findJsxFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) results.push(...findJsxFiles(full));
    else if (entry.endsWith('.jsx')) results.push(full);
  }
  return results;
}

const ROOT = join(__dirname, '..', '..', 'src', 'components');
const files = findJsxFiles(ROOT);

describe('Component imports', () => {
  for (const file of files) {
    const rel = relative(join(__dirname, '..', '..', 'src'), file);
    it(`imports ${rel} without errors`, async () => {
      await expect(import(file)).resolves.toBeDefined();
    });
  }
});
