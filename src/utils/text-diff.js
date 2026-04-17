/**
 * Compute a line-level diff between two strings.
 * Returns an array of { type: 'same'|'add'|'remove', line: string }
 */
export function computeLineDiff(oldText, newText) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');

  // Simple LCS-based diff
  const m = oldLines.length, n = newLines.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = oldLines[i-1] === newLines[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);

  const result = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i-1] === newLines[j-1]) {
      result.unshift({ type: 'same', line: oldLines[i-1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      result.unshift({ type: 'add', line: newLines[j-1] });
      j--;
    } else {
      result.unshift({ type: 'remove', line: oldLines[i-1] });
      i--;
    }
  }
  return result;
}
