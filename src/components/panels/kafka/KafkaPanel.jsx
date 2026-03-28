import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useResize } from '../../../hooks/useResize.js';

// ── C# consumer code generator ────────────────────────────────────────────────

function generateCSharpConsumer(connection, topic) {
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
  lines.push('    AutoOffsetReset   = AutoOffsetReset.Latest,');
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

// ── Collapsible message row ───────────────────────────────────────────────────

function MessageRow({ msg, expanded, onToggle }) {
  const rawVal = msg.value ?? '';
  let isJson = false;
  let pretty  = '';
  let preview = '';

  try {
    const parsed = JSON.parse(rawVal);
    if (parsed !== null && typeof parsed === 'object') {
      isJson  = true;
      pretty  = JSON.stringify(parsed, null, 2);
    }
  } catch {}

  if (isJson) {
    preview = rawVal.length > 120 ? rawVal.slice(0, 120) + '…' : rawVal;
  } else {
    const nl = rawVal.indexOf('\n');
    preview = nl >= 0 ? rawVal.slice(0, nl) : rawVal.slice(0, 200);
  }

  return (
    <div
      className={`kafka-feed-message${expanded ? ' kafka-feed-message--expanded' : ''}`}
      onClick={onToggle}
      title={expanded ? 'Click to collapse' : 'Click to expand'}
    >
      <span className="kafka-msg-stream">{msg.topic}</span>
      <span className="kafka-msg-meta">p{msg.partition}·{msg.offset}</span>
      {msg.key && <span className="kafka-msg-key">{msg.key}</span>}
      {expanded
        ? <span className="kafka-msg-value kafka-msg-value--expanded">
            {isJson ? <JsonHighlight str={pretty} /> : rawVal || '(null)'}
          </span>
        : <span className="kafka-msg-value kafka-msg-value--collapsed">
            {preview || '(null)'}
          </span>
      }
    </div>
  );
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
  return (
    <div
      className="kafka-chips-overflow"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
    >
      <span className="kafka-chips-overflow-btn">+{topics.length}</span>
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

export function KafkaPanel({ onToggle, asTab = false, onOpenAsTab, onReturnToPanel }) {
  const [savedConns,    setSavedConns]    = useState([]);
  const [selectedId,    setSelectedId]    = useState(null);
  const [formConn,      setFormConn]      = useState(null);
  const [topics,        setTopics]        = useState([]);
  const [topicFilter,   setTopicFilter]   = useState('');
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicError,    setTopicError]    = useState('');
  const [maxMessages,   setMaxMessages]   = useState(1000);

  // topic -> consumerId (tracks active listeners)
  const [listeners,   setListeners]   = useState({});
  const consumerIds   = useRef({});

  // unified chronological message feed
  const [allMessages,   setAllMessages]   = useState([]);
  const [expandedMsgs,  setExpandedMsgs]  = useState(new Set());
  const msgIdRef = useRef(0);

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

  useEffect(() => {
    const handler = (payload) => {
      const { consumerId, ...msg } = payload;
      if (!Object.values(consumerIds.current).includes(consumerId)) return;
      const id = ++msgIdRef.current;
      setAllMessages((prev) => [...prev, { ...msg, _id: id }].slice(-maxMessages));
    };
    window.electronAPI.onKafkaMessage(handler);
    return () => window.electronAPI.offKafkaMessage(handler);
  }, [maxMessages]);

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
    consumerIds.current[topic] = consumerId;
    setListeners((prev) => ({ ...prev, [topic]: consumerId }));
    try {
      await window.electronAPI.kafkaConsumeStart({
        consumerId,
        connection: { brokers: conn.brokers, ssl: conn.ssl, sasl: conn.sasl },
        topics: [topic],
        maxMessages,
      });
    } catch {
      delete consumerIds.current[topic];
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

  const handleCopyCode = (topic) => {
    const conn = savedConns.find((c) => c.id === selectedId);
    if (!conn) return;
    navigator.clipboard.writeText(generateCSharpConsumer(conn, topic)).then(() => {
      setCopiedTopic(topic);
      setTimeout(() => setCopiedTopic(null), 2000);
    });
  };

  const toggleExpand = useCallback((id) => {
    setExpandedMsgs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

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
        {asTab
          ? <button
              className="kafka-btn kafka-panel-tab-btn"
              onClick={onReturnToPanel}
              disabled={isListening}
              title={isListening ? 'Stop all streams before moving' : 'Move to panel'}
            >↙ Panel</button>
          : <button
              className="kafka-btn kafka-panel-tab-btn"
              onClick={onOpenAsTab}
              disabled={isListening}
              title={isListening ? 'Stop all streams before opening as tab' : 'Open as tab'}
            >↗ Tab</button>
        }
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
                {listenedTopics.length > 0 && (
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
                    <button
                      className="kafka-btn kafka-btn-stop kafka-stop-all-btn"
                      onClick={handleStopAll}
                      title="Stop all streams"
                    >■ All</button>
                  </div>
                )}
                <div className="kafka-feed-messages">
                  {allMessages.length === 0 && (
                    <div className="kafka-feed-empty">
                      {listenedTopics.length === 0 ? 'Press ▶ on a topic to start a live feed' : 'Waiting for messages…'}
                    </div>
                  )}
                  {allMessages.map((m) => (
                    <MessageRow
                      key={m._id}
                      msg={m}
                      expanded={expandedMsgs.has(m._id)}
                      onToggle={() => toggleExpand(m._id)}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
