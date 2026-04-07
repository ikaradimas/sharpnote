import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useResize } from '../../../hooks/useResize.js';
import { formatLogTime } from '../../../utils.js';

function parseLogContent(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const m = line.match(/^(\S+)\s+\[([^\]]+)\]\s+(.*)$/);
    if (m) return { timestamp: m[1], tag: m[2], message: m[3] };
    return { timestamp: '', tag: '', message: line };
  });
}

// Regex for 8-character base-36 cell IDs
const CELL_ID_RE = /\b([0-9a-z]{8})\b/g;

function MessageWithLinks({ message, cellIdSet, onNavigate }) {
  if (!cellIdSet || cellIdSet.size === 0) return <>{message}</>;

  const parts = [];
  let lastIndex = 0;
  let match;
  CELL_ID_RE.lastIndex = 0;
  while ((match = CELL_ID_RE.exec(message)) !== null) {
    if (cellIdSet.has(match[1])) {
      if (match.index > lastIndex) {
        parts.push(<span key={lastIndex}>{message.slice(lastIndex, match.index)}</span>);
      }
      const cellId = match[1];
      parts.push(
        <button
          key={match.index}
          className="log-cell-link"
          title={`Jump to cell ${cellId}`}
          onClick={() => onNavigate?.(cellId)}
        >
          {cellId}
        </button>
      );
      lastIndex = match.index + 8;
    }
  }
  if (parts.length === 0) return <>{message}</>;
  if (lastIndex < message.length) {
    parts.push(<span key={lastIndex}>{message.slice(lastIndex)}</span>);
  }
  return <>{parts}</>;
}

function LogEntry({ entry, cellIdSet, onNavigate }) {
  const msg = entry.message || '';
  const isCollapsible = msg.includes('\n') || msg.length > 120;
  const [collapsed, setCollapsed] = useState(isCollapsible);
  const time = formatLogTime(entry.timestamp);
  const tagClass = `log-tag log-tag-${(entry.tag || '').toLowerCase().replace(/[^a-z]/g, '')}`;
  return (
    <div className="log-entry">
      <span className="log-time">{time}</span>
      <span className={tagClass}>{entry.tag}</span>
      <span className="log-entry-toggle-cell">
        {isCollapsible && (
          <button
            className="log-entry-toggle"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        )}
      </span>
      <span className={`log-message${collapsed ? ' log-message-collapsed' : ''}`}>
        <MessageWithLinks
          message={msg}
          cellIdSet={cellIdSet}
          onNavigate={onNavigate}
        />
        {entry.memoryMb != null && (
          <span className="log-memory"> · {entry.memoryMb.toFixed(0)} MB</span>
        )}
      </span>
    </div>
  );
}

export function LogPanel({ isOpen, onToggle, currentMemoryMb = null, cells, onNavigateToCell }) {
  const [width, onResizeMouseDown] = useResize(320, 'left');
  const [logFiles, setLogFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState('live');
  const [fileEntries, setFileEntries] = useState([]);
  const [liveEntries, setLiveEntries] = useState([]);
  const [tagFilter, setTagFilter] = useState('');
  const scrollRef = useRef(null);
  const memoryRef = useRef(currentMemoryMb);
  useEffect(() => { memoryRef.current = currentMemoryMb; }, [currentMemoryMb]);

  const cellIdSet = useMemo(
    () => new Set((cells || []).map((c) => c.id)),
    [cells]
  );

  useEffect(() => {
    if (!isOpen || !window.electronAPI) return;
    window.electronAPI.getLogFiles().then(setLogFiles);
  }, [isOpen]);

  useEffect(() => {
    if (!window.electronAPI) return;
    const handler = (entry) => setLiveEntries((prev) => [
      ...prev,
      { ...entry, memoryMb: memoryRef.current },
    ]);
    window.electronAPI.onLogEntry(handler);
    return () => window.electronAPI.offLogEntry(handler);
  }, []);

  useEffect(() => {
    if (!isOpen || selectedFile === 'live' || !window.electronAPI) return;
    window.electronAPI.readLogFile(selectedFile).then((text) => {
      setFileEntries(parseLogContent(text || ''));
    });
  }, [isOpen, selectedFile]);

  useEffect(() => {
    if (scrollRef.current && isOpen) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [liveEntries, fileEntries, isOpen]);

  const rawEntries = selectedFile === 'live' ? liveEntries : fileEntries;

  // Reset tag filter when switching between live/file views
  useEffect(() => { setTagFilter(''); }, [selectedFile]);

  const allTags = useMemo(() => {
    const tags = new Set();
    for (const e of rawEntries) { if (e.tag) tags.add(e.tag); }
    return [...tags].sort();
  }, [rawEntries]);

  const entries = useMemo(
    () => tagFilter ? rawEntries.filter((e) => e.tag === tagFilter) : rawEntries,
    [rawEntries, tagFilter]
  );

  const handleDelete = async () => {
    if (selectedFile === 'live' || !window.electronAPI) return;
    await window.electronAPI.deleteLogFile(selectedFile);
    setLogFiles((prev) => prev.filter((f) => f !== selectedFile));
    setSelectedFile('live');
    setFileEntries([]);
  };

  const handleExport = async () => {
    if (!window.electronAPI) return;
    let content;
    if (selectedFile === 'live') {
      content = liveEntries.map((e) => `${e.timestamp} [${e.tag}] ${e.message}`).join('\n');
    } else {
      content = await window.electronAPI.readLogFile(selectedFile);
    }
    if (content) {
      await window.electronAPI.saveFile({
        content,
        defaultName: selectedFile === 'live' ? 'live.log' : selectedFile,
        filters: [{ name: 'Log', extensions: ['log'] }],
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="log-panel" style={{ width }}>
      <div className="resize-handle resize-h" onMouseDown={onResizeMouseDown} />
      <div className="log-panel-header">
        <select
          className="log-file-select"
          value={selectedFile}
          onChange={(e) => setSelectedFile(e.target.value)}
        >
          <option value="live">Live</option>
          {logFiles.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        {selectedFile === 'live' && <span className="log-live-dot" title="Live" />}
        <select
          className="log-tag-filter"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          title="Filter by tag"
        >
          <option value="">All tags</option>
          {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button className="log-header-btn" title="Export log" onClick={handleExport}>⬇</button>
        {selectedFile === 'live'
          ? <button className="log-header-btn" title="Clear live log" onClick={() => setLiveEntries([])}>⌫</button>
          : <button className="log-header-btn log-header-danger" title="Delete log file" onClick={handleDelete}>✕</button>
        }
        <button className="log-close-btn" title="Close logs" onClick={onToggle}>×</button>
      </div>
      <div className="log-entries" ref={scrollRef}>
        {entries.length === 0
          ? <div className="log-empty">No entries</div>
          : entries.map((e, i) => (
            <LogEntry
              key={i}
              entry={e}
              cellIdSet={cellIdSet}
              onNavigate={onNavigateToCell}
            />
          ))
        }
      </div>
    </div>
  );
}
