import { describe, it, expect, vi } from 'vitest';
import { graphExportBaseName, graphPdfLandscape, captureGraphPng } from '../../src/utils/graph-export.js';

describe('graphExportBaseName', () => {
  it('defaults to "orchestration" for empty/blank titles', () => {
    expect(graphExportBaseName('')).toBe('orchestration');
    expect(graphExportBaseName('   ')).toBe('orchestration');
    expect(graphExportBaseName(null)).toBe('orchestration');
  });

  it('sanitises spaces and unsafe characters to underscores', () => {
    expect(graphExportBaseName('Free Saved Searches Migration')).toBe('Free_Saved_Searches_Migration');
    expect(graphExportBaseName('a/b:c*?.cnb')).toBe('a_b_c_.cnb');
  });

  it('trims leading/trailing separators', () => {
    expect(graphExportBaseName('  //weird//  ')).toBe('weird');
  });
});

describe('graphPdfLandscape', () => {
  it('is landscape when wider than tall (or square)', () => {
    expect(graphPdfLandscape(800, 400)).toBe(true);
    expect(graphPdfLandscape(500, 500)).toBe(true);
  });
  it('is portrait when taller than wide', () => {
    expect(graphPdfLandscape(400, 900)).toBe(false);
  });
  it('handles missing dims', () => {
    expect(graphPdfLandscape()).toBe(true);
  });
});

describe('captureGraphPng', () => {
  const fakeSvg = {};
  const png = 'data:image/png;base64,ABC';
  const makeDti = () => ({ toPng: vi.fn().mockResolvedValue(png) });

  it('returns null (and never normalizes) when there is nothing to capture', async () => {
    const normalize = vi.fn(), restore = vi.fn(), loadDomToImage = vi.fn();
    expect(await captureGraphPng({ svg: null, totalW: 10, totalH: 10, normalize, restore, loadDomToImage })).toBeNull();
    expect(await captureGraphPng({ svg: fakeSvg, totalW: 0, totalH: 10, normalize, restore, loadDomToImage })).toBeNull();
    expect(await captureGraphPng({ svg: fakeSvg, totalW: 10, totalH: 0, normalize, restore, loadDomToImage })).toBeNull();
    expect(normalize).not.toHaveBeenCalled();
    expect(loadDomToImage).not.toHaveBeenCalled();
  });

  it('normalizes, rasterizes cropped to totalW×totalH, then restores', async () => {
    const order = [];
    const dti = makeDti();
    const normalize = vi.fn(() => order.push('normalize'));
    const restore = vi.fn(() => order.push('restore'));
    const loadDomToImage = vi.fn(async () => { order.push('load'); return dti; });

    const result = await captureGraphPng({
      svg: fakeSvg, totalW: 640, totalH: 480, bgcolor: '#1e1e1e', normalize, restore, loadDomToImage,
    });

    expect(result).toBe(png);
    expect(dti.toPng).toHaveBeenCalledWith(fakeSvg, expect.objectContaining({
      width: 640, height: 480, bgcolor: '#1e1e1e', cacheBust: true,
    }));
    // normalize must happen before capture; restore strictly after.
    expect(order).toEqual(['normalize', 'load', 'restore']);
    expect(restore).toHaveBeenCalledTimes(1);
  });

  it('still restores if rasterization throws', async () => {
    const normalize = vi.fn(), restore = vi.fn();
    const loadDomToImage = async () => ({ toPng: vi.fn().mockRejectedValue(new Error('boom')) });
    await expect(captureGraphPng({
      svg: fakeSvg, totalW: 10, totalH: 10, normalize, restore, loadDomToImage,
    })).rejects.toThrow('boom');
    expect(restore).toHaveBeenCalledTimes(1);
  });
});
