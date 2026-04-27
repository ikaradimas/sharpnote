import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';

// @marp-team/marp-core is ~200 KB compressed and only needed when a
// Marp-flagged markdown actually renders, so load it lazily — same pattern
// used for Leaflet (MapOutput) and cytoscape (NetworkOutput).
let marpLoader = null;
function loadMarp() {
  if (!marpLoader) {
    marpLoader = (async () => {
      const mod = await import('@marp-team/marp-core');
      return new mod.Marp({ inlineSVG: true, math: 'katex', html: true });
    })();
  }
  return marpLoader;
}

export function MarpRender({ content }) {
  const wrapperRef    = useRef(null);
  const [rendered,    setRendered]    = useState(null);   // { html, css }
  const [slideIdx,    setSlideIdx]    = useState(0);
  const [slideCount,  setSlideCount]  = useState(0);
  const [fullscreen,  setFullscreen]  = useState(false);

  // Render the markdown via marp-core whenever the source changes.
  useEffect(() => {
    let cancelled = false;
    loadMarp()
      .then((marp) => {
        if (cancelled) return;
        try {
          const result = marp.render(content || '', { htmlAsArray: false });
          setRendered({ html: result.html, css: result.css });
        } catch (e) {
          setRendered({ html: `<pre class="marp-error">${(e?.message || String(e)).replace(/</g, '&lt;')}</pre>`, css: '' });
        }
      })
      .catch((e) => setRendered({ html: `<pre class="marp-error">marp-core failed to load: ${e.message}</pre>`, css: '' }));
    return () => { cancelled = true; };
  }, [content]);

  // After the html lands in the DOM, count slides + show the active one.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const slides = Array.from(el.querySelectorAll('section, svg[data-marp-fitting]'));
    setSlideCount(slides.length);
    slides.forEach((s, i) => {
      s.style.display = i === slideIdx ? '' : 'none';
    });
  }, [rendered, slideIdx]);

  const onPrev = useCallback(() => setSlideIdx((i) => Math.max(0, i - 1)), []);
  const onNext = useCallback(() => setSlideIdx((i) => Math.min(Math.max(0, slideCount - 1), i + 1)), [slideCount]);

  // Track native fullscreen so the icon stays in sync if Esc is pressed.
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const onToggleFullscreen = useCallback(() => {
    const w = wrapperRef.current;
    if (!w) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else                            w.requestFullscreen?.();
  }, []);

  // Keyboard navigation while focused or fullscreen.
  useEffect(() => {
    const onKey = (e) => {
      if (!wrapperRef.current?.contains(document.activeElement) && !fullscreen) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); onNext(); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); onPrev(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext, onPrev, fullscreen]);

  const styleTag = useMemo(() => rendered?.css ? `<style>${rendered.css}</style>` : '', [rendered]);

  return (
    <div ref={wrapperRef} className="marp-render" tabIndex={0}>
      <div className="marp-toolbar">
        <button className="marp-btn" onClick={onPrev}             disabled={slideIdx === 0} title="Previous slide (←)">◀</button>
        <span className="marp-counter">{slideCount === 0 ? '—' : `${slideIdx + 1} / ${slideCount}`}</span>
        <button className="marp-btn" onClick={onNext}             disabled={slideCount === 0 || slideIdx >= slideCount - 1} title="Next slide (→)">▶</button>
        <button className="marp-btn" onClick={onToggleFullscreen} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>{fullscreen ? '⤡' : '⛶'}</button>
      </div>
      <div
        className="marp-stage"
        dangerouslySetInnerHTML={{ __html: styleTag + (rendered?.html ?? '') }}
      />
    </div>
  );
}
