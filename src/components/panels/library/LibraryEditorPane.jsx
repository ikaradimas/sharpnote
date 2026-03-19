import React from 'react';
import { CodeEditor } from '../../editor/CodeEditor.jsx';

export function LibraryEditorPane({ editor, onContentChange, onSave }) {
  return (
    <div className="lib-editor-pane">
      <div className="lib-editor-toolbar">
        <span className="lib-editor-filename">{editor.filename}</span>
        {editor.isDirty && <span className="lib-editor-dirty">&#9679;</span>}
        <span className="lib-editor-path">{editor.fullPath}</span>
        <button
          className="lib-editor-save-btn"
          onClick={() => onSave(editor.id)}
          title="Save (Ctrl+S)"
        >
          Save
        </button>
      </div>
      <div className="lib-editor-content">
        <CodeEditor
          value={editor.content}
          onChange={(val) => onContentChange(editor.id, val)}
          language="csharp"
        />
      </div>
    </div>
  );
}
