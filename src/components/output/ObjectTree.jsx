import React, { useState } from 'react';

function TreeNode({ label, value, depth }) {
  const [open, setOpen] = useState(depth < 2);

  if (value === null || value === undefined) {
    return (
      <div className="tree-row">
        {label != null && <span className="tree-key">{label}:{' '}</span>}
        <span className="tree-null">null</span>
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <div className="tree-row">
        {label != null && <span className="tree-key">{label}:{' '}</span>}
        <span className="tree-bool">{String(value)}</span>
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div className="tree-row">
        {label != null && <span className="tree-key">{label}:{' '}</span>}
        <span className="tree-num">{value}</span>
      </div>
    );
  }

  if (typeof value === 'string') {
    return (
      <div className="tree-row">
        {label != null && <span className="tree-key">{label}:{' '}</span>}
        <span className="tree-str">&quot;{value}&quot;</span>
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div className="tree-node">
        <div className="tree-row tree-expandable" onClick={() => setOpen((v) => !v)}>
          <span className="tree-chevron">{open ? '▾' : '▸'}</span>
          {label != null && <span className="tree-key">{label}:{' '}</span>}
          <span className="tree-type">Array [{value.length}]</span>
        </div>
        {open && (
          <div className="tree-children">
            {value.map((v, i) => (
              <TreeNode key={i} label={i} value={v} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    const preview = `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', …' : ''}}`;
    return (
      <div className="tree-node">
        <div className="tree-row tree-expandable" onClick={() => setOpen((v) => !v)}>
          <span className="tree-chevron">{open ? '▾' : '▸'}</span>
          {label != null && <span className="tree-key">{label}:{' '}</span>}
          <span className="tree-type">{preview}</span>
        </div>
        {open && (
          <div className="tree-children">
            {keys.map((k) => (
              <TreeNode key={k} label={k} value={value[k]} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="tree-row">
      {label != null && <span className="tree-key">{label}:{' '}</span>}
      <span className="tree-str">{String(value)}</span>
    </div>
  );
}

export function ObjectTree({ json }) {
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return <pre className="output-html">{json}</pre>;
  }

  return (
    <div className="object-tree">
      <TreeNode label={null} value={parsed} depth={0} />
    </div>
  );
}
