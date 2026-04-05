import React from 'react';

export function AddBar({ onAddMarkdown, onAddCode, onAddSql, onAddHttp, onAddShell, onAddCheck, onAddDecision }) {
  return (
    <div className="cell-add-bar">
      <div className="cell-add-bar-inner">
        <button className="cell-add-btn" onClick={onAddMarkdown}>+ Markdown</button>
        <button className="cell-add-btn" onClick={onAddCode}>+ Code</button>
        {onAddSql && <button className="cell-add-btn" onClick={onAddSql}>+ SQL</button>}
        {onAddHttp && <button className="cell-add-btn" onClick={onAddHttp}>+ HTTP</button>}
        {onAddShell && <button className="cell-add-btn" onClick={onAddShell}>+ Shell</button>}
        {onAddCheck && <button className="cell-add-btn" onClick={onAddCheck}>+ Check</button>}
        {onAddDecision && <button className="cell-add-btn" onClick={onAddDecision}>+ Decision</button>}
      </div>
    </div>
  );
}
