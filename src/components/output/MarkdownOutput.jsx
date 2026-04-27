import React, { useMemo, useEffect, useRef } from 'react';
import { marked } from 'marked';
import { applyMath, isMarpMarkdown } from '../../utils.js';
import { MarpRender } from './MarpRender.jsx';

let mermaidPromise = null;
function getMermaid() {
  if (!mermaidPromise) mermaidPromise = import('mermaid').then((m) => m.default);
  return mermaidPromise;
}

export function MarkdownOutput({ content }) {
  if (isMarpMarkdown(content)) return <MarpRender content={content} />;

  const renderRef = useRef(null);
  const renderedHtml = useMemo(
    () => (content ? marked.parse(applyMath(content)) : ''),
    [content]
  );

  useEffect(() => {
    const container = renderRef.current;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll('pre > code.language-mermaid'));
    if (nodes.length === 0) return;
    const ts = Date.now();
    getMermaid().then((mermaid) => {
      nodes.forEach(async (node, idx) => {
        const pre = node.parentElement;
        const graphDef = node.textContent;
        const id = `mermaid-out-${ts}-${idx}`;
        try {
          const { svg } = await mermaid.render(id, graphDef);
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-render';
          wrapper.innerHTML = svg;
          pre.replaceWith(wrapper);
        } catch (e) {
          const wrapper = document.createElement('div');
          wrapper.className = 'mermaid-render mermaid-error';
          wrapper.textContent = String(e.message || e);
          pre.replaceWith(wrapper);
        }
      });
    });
  }, [renderedHtml]);

  return (
    <div
      ref={renderRef}
      className="output-markdown markdown-view"
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}
