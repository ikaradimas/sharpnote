/**
 * Parse a unified diff string into structured hunks.
 *
 * @param {string} diffText - Raw output from `git diff`
 * @returns {Array<{ header: string, oldStart: number, oldCount: number, newStart: number, newCount: number, lines: Array<{ type: 'add'|'del'|'ctx', content: string, oldLine: number|null, newLine: number|null }> }>}
 */
export function parseDiff(diffText) {
  if (!diffText) return [];
  const rawLines = diffText.split('\n');
  const hunks = [];
  let current = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of rawLines) {
    // Hunk header: @@ -12,6 +14,8 @@ optional context
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)/);
    if (hunkMatch) {
      current = {
        header: line,
        oldStart: parseInt(hunkMatch[1]),
        oldCount: parseInt(hunkMatch[2] ?? '1'),
        newStart: parseInt(hunkMatch[3]),
        newCount: parseInt(hunkMatch[4] ?? '1'),
        context: hunkMatch[5]?.trim() || '',
        lines: [],
      };
      oldLine = current.oldStart;
      newLine = current.newStart;
      hunks.push(current);
      continue;
    }

    if (!current) continue;

    if (line.startsWith('+')) {
      current.lines.push({ type: 'add', content: line.slice(1), oldLine: null, newLine });
      newLine++;
    } else if (line.startsWith('-')) {
      current.lines.push({ type: 'del', content: line.slice(1), oldLine, newLine: null });
      oldLine++;
    } else if (line.startsWith(' ') || line === '') {
      current.lines.push({ type: 'ctx', content: line.slice(1), oldLine, newLine });
      oldLine++;
      newLine++;
    }
    // Skip lines like "\ No newline at end of file"
  }

  return hunks;
}
