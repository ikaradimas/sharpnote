/**
 * Pure helpers for exporting the orchestration dependency graph as an image / PDF.
 * The DOM/IPC glue lives in DependencyPanel; the orchestration below is factored out
 * so it can be unit-tested without a live SVG or Electron.
 */

/** Sanitise a notebook title into a safe export filename base (no extension). */
export function graphExportBaseName(title) {
  const base = (title || '').trim() || 'orchestration';
  return base.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'orchestration';
}

/** A graph wider than it is tall prints better on a landscape page. */
export function graphPdfLandscape(totalW, totalH) {
  return (totalW || 0) >= (totalH || 0);
}

/**
 * Rasterise the whole graph to a PNG data URL at natural (1:1) scale.
 *
 * The on-screen SVG bakes the current zoom/pan into its geometry, so before capturing
 * we `normalize()` it to natural scale (zoom 1, pan 0) — the caller supplies that (and
 * its inverse `restore()`), typically via flushSync so the DOM reflects it synchronously.
 * `restore()` always runs, even if rasterisation throws. The capture is cropped to
 * totalW×totalH so only the graph (not any surrounding viewport padding) is included.
 *
 * @returns {Promise<string|null>} PNG data URL, or null when there's nothing to capture.
 */
export async function captureGraphPng({ svg, totalW, totalH, bgcolor, normalize, restore, loadDomToImage }) {
  if (!svg || !(totalW > 0) || !(totalH > 0)) return null;
  normalize?.();
  try {
    const domToImage = await loadDomToImage();
    return await domToImage.toPng(svg, {
      width: totalW,
      height: totalH,
      bgcolor: bgcolor || undefined,
      cacheBust: true,
    });
  } finally {
    restore?.();
  }
}
