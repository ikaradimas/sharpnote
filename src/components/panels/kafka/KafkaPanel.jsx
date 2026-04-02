import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useResize } from '../../../hooks/useResize.js';
import { useOutsideClick } from '../../../hooks/useOutsideClick.js';

// ── C# consumer code generator ────────────────────────────────────────────────

function generateCSharpConsumer(connection, topic, fromBeginning) {
  const brokers = (connection.brokers || []).join(',');
  const hasSasl  = !!connection.sasl;
  const lines = [];

  lines.push('// Install: dotnet add package Confluent.Kafka');
  lines.push('using Confluent.Kafka;');
  lines.push('');
  lines.push('var config = new ConsumerConfig');
  lines.push('{');
  lines.push(`    BootstrapServers = "${brokers}",`);
  lines.push(`    GroupId           = "my-consumer-group",`);
  lines.push(`    AutoOffsetReset   = AutoOffsetReset.${fromBeginning ? 'Earliest' : 'Latest'},`);
  if (hasSasl) {
    const mech = connection.sasl.mechanism?.toUpperCase().replace(/-/g, '_') ?? 'PLAIN';
    lines.push(`    SecurityProtocol  = SecurityProtocol.SaslSsl,`);
    lines.push(`    SaslMechanism     = SaslMechanism.${mech === 'PLAIN' ? 'Plain' : mech === 'SCRAM_SHA_256' ? 'ScramSha256' : 'ScramSha512'},`);
    lines.push(`    SaslUsername      = "${connection.sasl.username ?? ''}",`);
    lines.push(`    SaslPassword      = "${connection.sasl.password ?? ''}",`);
  } else if (connection.ssl) {
    lines.push(`    SecurityProtocol  = SecurityProtocol.Ssl,`);
  }
  lines.push('};');
  lines.push('');
  lines.push(`using var consumer = new ConsumerBuilder<Ignore, string>(config).Build();`);
  lines.push(`consumer.Subscribe("${topic}");`);
  lines.push('');
  lines.push('try');
  lines.push('{');
  lines.push('    while (true)');
  lines.push('    {');
  lines.push('        var result = consumer.Consume(TimeSpan.FromSeconds(5));');
  lines.push('        if (result == null) continue;');
  lines.push(`        Console.WriteLine($"[{result.TopicPartitionOffset}] {result.Message.Value}");`);
  lines.push('        await Task.Delay(20);');
  lines.push('    }');
  lines.push('}');
  lines.push('finally');
  lines.push('{');
  lines.push('    consumer.Close();');
  lines.push('}');

  return lines.join('\n');
}

// ── JSON syntax highlighter ───────────────────────────────────────────────────

function highlightJson(str) {
  const segs = [];
  // match: string-then-colon (key), bare string (value), keyword, number, punctuation
  const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(\b(?:true|false|null)\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}\[\],:])/g;
  let last = 0;
  let m;
  while ((m = re.exec(str)) !== null) {
    if (m.index > last) segs.push({ text: str.slice(last, m.index), cls: null });
    if (m[1] !== undefined) {
      segs.push({ text: m[1], cls: m[2] ? 'kafka-json-key' : 'kafka-json-str' });
      if (m[2]) segs.push({ text: m[2], cls: 'kafka-json-punct' });
    } else if (m[3] !== undefined) {
      segs.push({ text: m[3], cls: 'kafka-json-kw' });
    } else if (m[4] !== undefined) {
      segs.push({ text: m[4], cls: 'kafka-json-num' });
    } else if (m[5] !== undefined) {
      segs.push({ text: m[5], cls: 'kafka-json-punct' });
    }
    last = re.lastIndex;
  }
  if (last < str.length) segs.push({ text: str.slice(last), cls: null });
  return segs;
}

function JsonHighlight({ str }) {
  return highlightJson(str).map((s, i) =>
    s.cls
      ? <span key={i} className={s.cls}>{s.text}</span>
      : <React.Fragment key={i}>{s.text}</React.Fragment>
  );
}

const COPY_ICON = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

// ── Imperative message DOM builder (no React render) ─────────────────────────

function buildMessageEl(msg) {
  const rawVal = msg.value ?? '';
  let isJson = false, pretty = '', preview = '';
  try {
    // Strip leading BOM / null bytes (Windows producers, Confluent Schema Registry wire format)
    // and trailing "#<digits>" sequence numbers (Java producers) before attempting JSON parse
    const jsonCandidate = rawVal
      .replace(/^[\uFEFF\x00]+/, '')
      .replace(/\s*#\d+\s*$/, '');
    const parsed = JSON.parse(jsonCandidate);
    if (parsed !== null && typeof parsed === 'object') {
      isJson = true;
      pretty = JSON.stringify(parsed, null, 2);
    }
  } catch {}
  if (isJson) {
    preview = rawVal.length > 120 ? rawVal.slice(0, 120) + '…' : rawVal;
  } else {
    const nl = rawVal.indexOf('\n');
    preview = nl >= 0 ? rawVal.slice(0, nl) : rawVal.slice(0, 200);
  }

  const span = (cls, text) => { const el = document.createElement('span'); el.className = cls; el.textContent = text; return el; };

  const copyBtn = document.createElement('button');
  copyBtn.className = 'kafka-msg-copy';
  copyBtn.title = 'Copy value';
  copyBtn.innerHTML = COPY_ICON;
  copyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(rawVal).then(() => {
      copyBtn.textContent = '✓';
      setTimeout(() => { copyBtn.innerHTML = COPY_ICON; }, 1500);
    });
  });

  const summary = document.createElement('summary');
  summary.className = 'kafka-msg-summary';
  summary.append(
    span('kafka-msg-stream', msg.topic),
    span('kafka-msg-meta', `p${msg.partition}·${msg.offset}`),
    ...(msg.key ? [span('kafka-msg-key', msg.key)] : []),
    span('kafka-msg-value kafka-msg-value--collapsed', preview || '(null)'),
    copyBtn,
  );

  const expanded = document.createElement('span');
  expanded.className = 'kafka-msg-value kafka-msg-value--expanded';
  if (isJson) {
    highlightJson(pretty).forEach(({ text, cls }) => {
      if (cls) { const s = document.createElement('span'); s.className = cls; s.textContent = text; expanded.appendChild(s); }
      else expanded.appendChild(document.createTextNode(text));
    });
  } else {
    expanded.textContent = rawVal || '(null)';
  }
  const body = document.createElement('div');
  body.className = 'kafka-msg-body';
  body.appendChild(expanded);

  const details = document.createElement('details');
  details.className = 'kafka-feed-message';
  details.append(summary, body);
  return details;
}

// ── Connection form ───────────────────────────────────────────────────────────

const SASL_MECHANISMS = [
  { key: 'plain',         label: 'PLAIN'         },
  { key: 'scram-sha-256', label: 'SCRAM-SHA-256'  },
  { key: 'scram-sha-512', label: 'SCRAM-SHA-512'  },
];

function KafkaConnectionForm({ connection, existingNames, onSave, onCancel }) {
  const [name,     setName]     = useState(connection?.name    ?? '');
  const [brokers,  setBrokers]  = useState((connection?.brokers ?? ['localhost:9092']).join(', '));
  const [ssl,      setSsl]      = useState(connection?.ssl     ?? false);
  const [useSasl,  setUseSasl]  = useState(!!connection?.sasl);
  const [saslMech, setSaslMech] = useState(connection?.sasl?.mechanism ?? 'plain');
  const [saslUser, setSaslUser] = useState(connection?.sasl?.username  ?? '');
  const [saslPass, setSaslPass] = useState(connection?.sasl?.password  ?? '');
  const [error,    setError]    = useState('');

  const handleSave = () => {
    const n = name.trim();
    const b = brokers.split(',').map((s) => s.trim()).filter(Boolean);
    if (!n)        { setError('Name is required.'); return; }
    if (!b.length) { setError('At least one broker is required.'); return; }
    const isDup = existingNames
      .filter((en) => en !== connection?.name)
      .some((en) => en.toLowerCase() === n.toLowerCase());
    if (isDup) { setError(`A connection named "${n}" already exists.`); return; }

    onSave({
      id:      connection?.id ?? uuidv4(),
      name:    n,
      brokers: b,
      ssl:     ssl || useSasl,
      sasl:    useSasl ? { mechanism: saslMech, username: saslUser, password: saslPass } : null,
    });
  };

  return (
    <div className="kafka-conn-form">
      <input className="nuget-input" placeholder="Connection name" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
      <input className="nuget-input" placeholder="Brokers (comma-separated, e.g. host:9092)" value={brokers} onChange={(e) => setBrokers(e.target.value)} spellCheck={false} />
      <label className="kafka-checkbox-row">
        <input type="checkbox" checked={ssl} onChange={(e) => setSsl(e.target.checked)} />
        <span>SSL</span>
      </label>
      <label className="kafka-checkbox-row">
        <input type="checkbox" checked={useSasl} onChange={(e) => { setUseSasl(e.target.checked); if (e.target.checked) setSsl(true); }} />
        <span>SASL authentication</span>
      </label>
      {useSasl && (
        <>
          <select className="nuget-input" value={saslMech} onChange={(e) => setSaslMech(e.target.value)}>
            {SASL_MECHANISMS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <input className="nuget-input" placeholder="Username" value={saslUser} onChange={(e) => setSaslUser(e.target.value)} spellCheck={false} />
          <input className="nuget-input" placeholder="Password" type="password" value={saslPass} onChange={(e) => setSaslPass(e.target.value)} />
        </>
      )}
      {error && <div className="kafka-form-error">{error}</div>}
      <div className="kafka-form-actions">
        <button className="kafka-btn kafka-btn-primary" onClick={handleSave}>Save</button>
        <button className="kafka-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Overflow chips tooltip ────────────────────────────────────────────────────

const CHIP_LIMIT = 10;

function ChipOverflow({ topics, onStop }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useOutsideClick(wrapRef, () => setOpen(false), open);

  return (
    <div ref={wrapRef} className="kafka-chips-overflow">
      <span
        className={`kafka-chips-overflow-btn${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >+{topics.length}</span>
      {open && (
        <div className="kafka-chips-overflow-tooltip">
          {topics.map((t) => (
            <span key={t} className="kafka-listener-chip">
              <span>{t}</span>
              <button
                className="kafka-chip-stop"
                onClick={(e) => { e.stopPropagation(); onStop(t); }}
                title="Stop"
              >■</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function KafkaPanel({ onToggle, asTab = false }) {
  const [savedConns,    setSavedConns]    = useState([]);
  const [selectedId,    setSelectedId]    = useState(null);
  const [formConn,      setFormConn]      = useState(null);
  const [topics,        setTopics]        = useState([]);
  const [topicFilter,   setTopicFilter]   = useState('');
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicError,    setTopicError]    = useState('');
  const [maxMessages,   setMaxMessages]   = useState(1000);
  const [fromBeginning, setFromBeginning] = useState(false);

  // topic -> consumerId (tracks active listeners)
  const [listeners,   setListeners]   = useState({});
  const consumerIds   = useRef({});
  // topic -> stable groupId (reused by Next to continue from committed offset)
  const groupIds      = useRef({});

  // unified chronological message feed — stored in a plain ref, never in state
  const allMsgsRef    = useRef([]);
  const feedRef       = useRef(null);   // DOM container for messages
  const pageRef       = useRef(1);
  const renderedPageRef = useRef(1);    // page currently in the DOM (updated after replaceChildren)
  const expandedRef   = useRef({});     // pageNum -> Set<index> of open <details>
  const pendingRef    = useRef([]);
  const flushTimer    = useRef(null);
  const [pager, setPager] = useState({ total: 0, page: 1, totalPages: 1 });
  const PAGE_SIZE = 50;

  const [copiedTopic, setCopiedTopic] = useState(null);

  // ── Resizable panes ──────────────────────────────────────────────────────────
  const [leftW, leftDragDown] = useResize(200, 'right');

  const [topicsH,    setTopicsH]    = useState(220);
  const topicsHRef   = useRef(220);
  const topicsDragDown = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = topicsHRef.current;
    const onMove = (ev) => {
      const h = Math.max(60, Math.min(600, startH + (ev.clientY - startY)));
      topicsHRef.current = h;
      setTopicsH(h);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  // ── Data loading ──────────────────────────────────────────────────────────────

  useEffect(() => {
    window.electronAPI.loadKafkaSaved().then((list) => setSavedConns(list || []));
  }, []);

  // ── Message streaming ─────────────────────────────────────────────────────────

  // Render one page directly into the DOM — zero React involvement
  const renderPage = useCallback((pageNum) => {
    const container = feedRef.current;
    if (!container) return;
    // Save expanded state for the page currently in the DOM before replacing it
    const leaving = renderedPageRef.current;
    const openIndices = new Set();
    Array.from(container.children).forEach((el, i) => { if (el.open) openIndices.add(i); });
    expandedRef.current[leaving] = openIndices;
    const frag = document.createDocumentFragment();
    allMsgsRef.current
      .slice((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE)
      .forEach((m) => frag.appendChild(buildMessageEl(m)));
    container.replaceChildren(frag);
    renderedPageRef.current = pageNum;
    const toRestore = expandedRef.current[pageNum];
    if (toRestore && toRestore.size > 0) {
      Array.from(container.children).forEach((el, i) => { if (toRestore.has(i)) el.open = true; });
    }
  }, []);

  const handlePageChange = useCallback((newPage) => {
    pageRef.current = newPage;
    renderPage(newPage);
    setPager((prev) => ({ ...prev, page: newPage }));
  }, [renderPage]);

  // maxMessages in a ref so the handler closure never goes stale
  const maxMessagesRef = useRef(maxMessages);
  useEffect(() => { maxMessagesRef.current = maxMessages; }, [maxMessages]);

  useEffect(() => {
    let idCounter = 0;
    const handler = (payload) => {
      const { consumerId, ...msg } = payload;
      if (!Object.values(consumerIds.current).includes(consumerId)) return;
      pendingRef.current.push({ ...msg, _id: ++idCounter });
      if (flushTimer.current) return;
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        const batch = pendingRef.current.splice(0);
        const all = allMsgsRef.current;
        all.push(...batch);
        if (all.length > maxMessagesRef.current) all.splice(0, all.length - maxMessagesRef.current);
        const total = all.length;
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const curPage = Math.min(pageRef.current, totalPages);
        // Only re-paint DOM if the user is watching the last page
        if (curPage === totalPages) renderPage(curPage);
        setPager({ total, page: curPage, totalPages });
      }, 100);
    };
    window.electronAPI.onKafkaMessage(handler);
    return () => {
      window.electronAPI.offKafkaMessage(handler);
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    };
  }, [renderPage]);

  // Stop all listeners on unmount
  useEffect(() => {
    return () => {
      Object.values(consumerIds.current).forEach((id) => {
        window.electronAPI.kafkaConsumeStop(id).catch(() => {});
      });
    };
  }, []);

  // ── Connection management ─────────────────────────────────────────────────────

  const persist = useCallback((list) => {
    setSavedConns(list);
    window.electronAPI.saveKafkaSaved(list);
  }, []);

  const handleSaveConn = (conn) => {
    const existing = savedConns.find((c) => c.id === conn.id);
    persist(existing
      ? savedConns.map((c) => c.id === conn.id ? conn : c)
      : [...savedConns, conn]);
    setFormConn(null);
  };

  const handleDeleteConn = (id) => {
    if (selectedId === id) { setSelectedId(null); setTopics([]); setTopicError(''); }
    persist(savedConns.filter((c) => c.id !== id));
  };

  const handleConnect = async (conn) => {
    setSelectedId(conn.id);
    setTopics([]);
    setTopicError('');
    setTopicFilter('');
    setLoadingTopics(true);
    try {
      const result = await window.electronAPI.kafkaListTopics({
        brokers: conn.brokers, ssl: conn.ssl, sasl: conn.sasl,
      });
      setTopics(result.topics || []);
    } catch (err) {
      setTopicError(err?.message || 'Failed to connect');
    } finally {
      setLoadingTopics(false);
    }
  };

  // ── Topic listening ───────────────────────────────────────────────────────────

  const handleListen = async (topic) => {
    if (listeners[topic]) return;
    const conn = savedConns.find((c) => c.id === selectedId);
    if (!conn) return;
    const consumerId = uuidv4();
    // Generate a fresh stable groupId for this topic session
    const groupId = `sharpnote-browse-${uuidv4()}`;
    groupIds.current[topic] = groupId;
    consumerIds.current[topic] = consumerId;
    setListeners((prev) => ({ ...prev, [topic]: consumerId }));
    try {
      await window.electronAPI.kafkaConsumeStart({
        consumerId,
        connection: { brokers: conn.brokers, ssl: conn.ssl, sasl: conn.sasl },
        topics: [topic],
        maxMessages,
        fromBeginning,
        groupId,
      });
    } catch {
      delete consumerIds.current[topic];
      delete groupIds.current[topic];
      setListeners((prev) => { const n = { ...prev }; delete n[topic]; return n; });
    }
  };

  const handleStopListen = async (topic) => {
    const consumerId = consumerIds.current[topic];
    if (consumerId) {
      await window.electronAPI.kafkaConsumeStop(consumerId).catch(() => {});
      delete consumerIds.current[topic];
    }
    setListeners((prev) => { const n = { ...prev }; delete n[topic]; return n; });
  };

  const handleStopAll = async () => {
    await Promise.all(Object.keys(listeners).map(handleStopListen));
  };

  const clearFeed = () => {
    allMsgsRef.current = [];
    pendingRef.current = [];
    clearTimeout(flushTimer.current);
    flushTimer.current = null;
    pageRef.current = 1;
    renderedPageRef.current = 1;
    expandedRef.current = {};
    feedRef.current?.replaceChildren();
    setPager({ total: 0, page: 1, totalPages: 1 });
  };

  const handleClear = async () => {
    await Promise.all(Object.keys(listeners).map(handleStopListen));
    groupIds.current = {};
    clearFeed();
  };

  const handleNext = async () => {
    const activeTopics = Object.keys(listeners);
    if (!activeTopics.length) return;
    const conn = savedConns.find((c) => c.id === selectedId);
    if (!conn) return;

    // Stop current consumers (clears consumerIds.current entries)
    await Promise.all(activeTopics.map(handleStopListen));
    clearFeed();

    // Restart with the same groupIds so Kafka continues from committed offset
    const newListeners = {};
    await Promise.all(activeTopics.map(async (topic) => {
      const consumerId = uuidv4();
      const groupId = groupIds.current[topic];
      consumerIds.current[topic] = consumerId;
      newListeners[topic] = consumerId;
      try {
        await window.electronAPI.kafkaConsumeStart({
          consumerId,
          connection: { brokers: conn.brokers, ssl: conn.ssl, sasl: conn.sasl },
          topics: [topic],
          maxMessages,
          fromBeginning: false,
          groupId,
        });
      } catch {
        delete consumerIds.current[topic];
        delete newListeners[topic];
      }
    }));
    setListeners(newListeners);
  };

  const handleCopyCode = (topic) => {
    const conn = savedConns.find((c) => c.id === selectedId);
    if (!conn) return;
    navigator.clipboard.writeText(generateCSharpConsumer(conn, topic, fromBeginning)).then(() => {
      setCopiedTopic(topic);
      setTimeout(() => setCopiedTopic(null), 2000);
    });
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const selectedConn   = savedConns.find((c) => c.id === selectedId) ?? null;
  const existingNames  = savedConns.map((c) => c.name);
  const filteredTopics = topics.filter((t) =>
    !topicFilter || t.toLowerCase().includes(topicFilter.toLowerCase())
  );
  const listenedTopics = Object.keys(listeners);
  const isListening    = listenedTopics.length > 0;
  const visibleChips   = listenedTopics.slice(0, CHIP_LIMIT);
  const hiddenChips    = listenedTopics.slice(CHIP_LIMIT);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="kafka-panel">
      <div className="kafka-panel-header">
        <span className="kafka-panel-title">Kafka Browser</span>
        {!asTab && <button className="log-close-btn kafka-panel-close-btn" onClick={onToggle} title="Close">×</button>}
      </div>

      <div className="kafka-panel-body">

        {/* ── Left: connection list ── */}
        <div className="kafka-conn-list" style={{ width: leftW }}>
          <div className="kafka-conn-list-header">
            <span className="kafka-section-label">Brokers</span>
            {!formConn && (
              <button className="kafka-btn kafka-btn-add" onClick={() => setFormConn({})} title="Add connection">+</button>
            )}
          </div>

          {formConn !== null && (
            <KafkaConnectionForm
              connection={formConn.id ? formConn : null}
              existingNames={existingNames}
              onSave={handleSaveConn}
              onCancel={() => setFormConn(null)}
            />
          )}

          {savedConns.length === 0 && formConn === null && (
            <div className="kafka-empty-hint">No brokers saved. Click + to add one.</div>
          )}

          {savedConns.map((conn) => (
            <div
              key={conn.id}
              className={`kafka-conn-item${selectedId === conn.id ? ' kafka-conn-item--selected' : ''}`}
            >
              <div className="kafka-conn-info" onClick={() => handleConnect(conn)}>
                <span className="kafka-conn-name">{conn.name}</span>
                <span className="kafka-conn-brokers">{conn.brokers.join(', ')}</span>
              </div>
              <div className="kafka-conn-actions">
                <button className="kafka-btn kafka-btn-connect" onClick={() => handleConnect(conn)} title="Connect">→</button>
                <button className="kafka-btn" onClick={() => setFormConn(conn)} title="Edit">✎</button>
                <button className="kafka-btn kafka-btn-danger" onClick={() => handleDeleteConn(conn.id)} title="Delete">✕</button>
              </div>
            </div>
          ))}

          <div className="kafka-max-row">
            <span className="kafka-section-label">Max messages</span>
            <input
              className="kafka-max-input"
              type="number" min={1} max={10000}
              value={maxMessages}
              onChange={(e) => setMaxMessages(Math.max(1, parseInt(e.target.value) || 100))}
            />
          </div>
          <div className="kafka-offset-row">
            <span className="kafka-section-label">Start from</span>
            <div className="kafka-offset-toggle" title={fromBeginning ? 'Reading from the earliest available message' : 'Reading only new messages from now'}>
              <button
                className={`kafka-offset-btn${!fromBeginning ? ' active' : ''}`}
                onClick={() => setFromBeginning(false)}
              >End</button>
              <button
                className={`kafka-offset-btn${fromBeginning ? ' active' : ''}`}
                onClick={() => setFromBeginning(true)}
              >Beginning</button>
            </div>
          </div>
        </div>

        {/* ── Horizontal resize handle ── */}
        <div className="kafka-resize-h" onMouseDown={leftDragDown} />

        {/* ── Right: topics + unified feed ── */}
        <div className="kafka-right">
          {!selectedConn ? (
            <div className="kafka-right-empty">Select a broker to browse topics</div>
          ) : (
            <>
              {/* Topics section */}
              <div className="kafka-topics-section" style={{ height: topicsH }}>
                <div className="kafka-topics-header">
                  <span className="kafka-section-label">
                    {loadingTopics ? 'Connecting…' : `Topics (${filteredTopics.length}${topicFilter ? ' filtered' : ''})`}
                  </span>
                  {filteredTopics.length > 0 && !loadingTopics && (
                    <button
                      className="kafka-btn"
                      onClick={() => filteredTopics.forEach((t) => { if (!listeners[t]) handleListen(t); })}
                      title="Listen to all visible topics"
                    >▶ All</button>
                  )}
                </div>
                {topicError && <div className="kafka-error">{topicError}</div>}
                {!loadingTopics && !topicError && topics.length > 0 && (
                  <input
                    className="nuget-input kafka-topic-filter"
                    placeholder="Filter topics…"
                    value={topicFilter}
                    onChange={(e) => setTopicFilter(e.target.value)}
                    spellCheck={false}
                  />
                )}
                {!loadingTopics && !topicError && (
                  <div className="kafka-topic-list">
                    {filteredTopics.map((topic) => {
                      const isTopicListening = !!listeners[topic];
                      const copied = copiedTopic === topic;
                      return (
                        <div key={topic} className={`kafka-topic-row${isTopicListening ? ' kafka-topic-row--listening' : ''}`}>
                          <span className="kafka-topic-name" title={topic}>{topic}</span>
                          <div className="kafka-topic-actions">
                            {isTopicListening
                              ? <button className="kafka-btn kafka-btn-stop" onClick={() => handleStopListen(topic)} title="Stop listening">■</button>
                              : <button className="kafka-btn kafka-btn-listen" onClick={() => handleListen(topic)} title="Listen">▶</button>
                            }
                            <button
                              className={`kafka-btn${copied ? ' kafka-btn-copied' : ''}`}
                              onClick={() => handleCopyCode(topic)}
                              title="Copy C# consumer code"
                            >{copied ? '✓' : 'C#'}</button>
                          </div>
                        </div>
                      );
                    })}
                    {filteredTopics.length === 0 && topics.length > 0 && (
                      <div className="kafka-right-empty">No topics match "{topicFilter}"</div>
                    )}
                    {filteredTopics.length === 0 && topics.length === 0 && (
                      <div className="kafka-right-empty">No topics found</div>
                    )}
                  </div>
                )}
              </div>

              {/* Vertical resize handle */}
              <div className="kafka-resize-v" onMouseDown={topicsDragDown} />

              {/* Unified message feed */}
              <div className="kafka-feed-section">
                {(isListening || pager.total > 0) && (
                  <div className="kafka-listener-chips">
                    {visibleChips.map((topic) => (
                      <span key={topic} className="kafka-listener-chip">
                        <span>{topic}</span>
                        <button className="kafka-chip-stop" onClick={() => handleStopListen(topic)} title="Stop">■</button>
                      </span>
                    ))}
                    {hiddenChips.length > 0 && (
                      <ChipOverflow topics={hiddenChips} onStop={handleStopListen} />
                    )}
                    <div className="kafka-feed-btns">
                      {isListening && (
                        <button className="kafka-btn kafka-btn-stop" onClick={handleStopAll} title="Stop all streams">■ All</button>
                      )}
                      <button
                        className="kafka-btn"
                        onClick={handleNext}
                        disabled={!isListening}
                        title={`Fetch next ${maxMessages} messages from committed offset`}
                      >Next</button>
                      <button
                        className="kafka-btn kafka-btn-danger"
                        onClick={handleClear}
                        title="Stop all streams and clear messages"
                      >Clear</button>
                    </div>
                  </div>
                )}
                {pager.total === 0 && (
                  <div className="kafka-feed-empty">
                    {listenedTopics.length === 0 ? 'Press ▶ on a topic to start a live feed' : 'Waiting for messages…'}
                  </div>
                )}
                <div className="kafka-feed-messages" ref={feedRef} />
                {pager.total > 0 && (
                  <div className="kafka-feed-pager">
                    <button className="kafka-btn" onClick={() => handlePageChange(1)} disabled={pager.page === 1} title="First">«</button>
                    <button className="kafka-btn" onClick={() => handlePageChange(pager.page - 1)} disabled={pager.page === 1} title="Previous">‹</button>
                    <span className="kafka-pager-info">
                      {pager.page} / {pager.totalPages}
                      <span className="kafka-pager-count"> ({pager.total})</span>
                    </span>
                    <button className="kafka-btn" onClick={() => handlePageChange(pager.page + 1)} disabled={pager.page === pager.totalPages} title="Next">›</button>
                    <button className="kafka-btn" onClick={() => handlePageChange(pager.totalPages)} disabled={pager.page === pager.totalPages} title="Last">»</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
