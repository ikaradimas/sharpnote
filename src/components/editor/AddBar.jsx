import React from 'react';
import { Plus, Code, FileText, Database, Globe, Terminal, CheckCircle, GitBranch, Container, Clipboard } from 'lucide-react';

export function AddBar({ onAddMarkdown, onAddCode, onAddSql, onAddHttp, onAddShell, onAddDocker, onAddCheck, onAddDecision, onPaste }) {
  return (
    <div className="cell-add-bar">
      <div className="cell-add-bar-inner">
        <button className="cell-add-btn cell-add-md" onClick={onAddMarkdown}><Plus size={11} /><FileText size={11} /> Markdown</button>
        <button className="cell-add-btn cell-add-code" onClick={onAddCode}><Plus size={11} /><Code size={11} /> Code</button>
        {onAddSql && <button className="cell-add-btn cell-add-sql" onClick={onAddSql}><Plus size={11} /><Database size={11} /> SQL</button>}
        {onAddHttp && <button className="cell-add-btn cell-add-http" onClick={onAddHttp}><Plus size={11} /><Globe size={11} /> HTTP</button>}
        {onAddShell && <button className="cell-add-btn cell-add-shell" onClick={onAddShell}><Plus size={11} /><Terminal size={11} /> Shell</button>}
        {onAddDocker && <button className="cell-add-btn cell-add-docker" onClick={onAddDocker}><Plus size={11} /><Container size={11} /> Docker</button>}
        {onAddCheck && <button className="cell-add-btn cell-add-check" onClick={onAddCheck}><Plus size={11} /><CheckCircle size={11} /> Check</button>}
        {onAddDecision && <button className="cell-add-btn cell-add-decision" onClick={onAddDecision}><Plus size={11} /><GitBranch size={11} /> Decision</button>}
        {onPaste && <button className="cell-add-btn cell-add-paste" onClick={onPaste}><Clipboard size={11} /> Paste</button>}
      </div>
    </div>
  );
}
