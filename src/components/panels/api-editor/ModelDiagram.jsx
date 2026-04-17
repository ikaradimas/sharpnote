import React, { useRef, useEffect } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({ startOnLoad: false, theme: 'dark' });

export function ModelDiagram({ models }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!models?.length || !ref.current) return;
    let erd = 'erDiagram\n';
    for (const m of models) {
      if (!m.name) continue;
      erd += `  ${m.name} {\n`;
      for (const f of m.fields || []) {
        const typeName = (f.type || 'string').replace(/[<>]/g, '');
        erd += `    ${typeName} ${f.name || 'unnamed'}\n`;
      }
      erd += '  }\n';
      for (const f of m.fields || []) {
        const rawType = f.type || '';
        const isList = rawType.startsWith('List<');
        const innerType = isList ? rawType.slice(5, -1) : rawType;
        if (models.some(other => other.name === innerType && other.name !== m.name)) {
          const rel = isList ? '||--o{' : '||--o|';
          erd += `  ${m.name} ${rel} ${innerType} : "${f.name || ''}"\n`;
        }
      }
    }
    const id = 'model-erd-' + Date.now();
    mermaid.render(id, erd).then(({ svg }) => {
      if (ref.current) ref.current.innerHTML = svg;
    }).catch(() => {
      if (ref.current) ref.current.innerHTML = '<span style="color:var(--text-dim)">Unable to render diagram</span>';
    });
  }, [models]);

  if (!models?.length) return null;
  return <div ref={ref} className="model-diagram" />;
}
