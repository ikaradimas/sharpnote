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

// ── Main panel ────────────────────────────────────────────────────────────────

export function KafkaPanel({ onToggle }) {
  const [savedConns,    setSavedConns]    = useState([]);
  const [selectedId,    setSelectedId]    = useState(null);
  const [formConn,      setFormConn]      = useState(null);
  const [topics,        setTopics]        = useState([]);
  const [topicFilter,   setTopicFilter]   = useState('');
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicError,    setTopicError]    = useState('');
  const [maxMessages,   setMaxMessages]   = useState(100);

  // topic -> consumerId (tracks active listeners)
  const [listeners,   setListeners]   = useState({});
  const consumerIds   = useRef({});          // same data as listeners but sync ref for handler

  // unified chronological message feed
  const [allMessages, setAllMessages] = useState([]);
  const endRef = useRef(null);

  const [copiedTopic, setCopiedTopic] = useState(null);

  // ── Resizable panes ──────────────────────────────────────────────────────────
  const [leftW, leftDragDown] = useResize(200, 'right');

  // Topics section height (vertical drag between topics list and message feed)
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
      setAllMessages((prev) => [...prev, msg].slice(-maxMessages));
    };
    window.electronAPI.onKafkaMessage(handler);
    return () => window.electronAPI.offKafkaMessage(handler);
  }, [maxMessages]);

  // Auto-scroll feed to bottom on new messages
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [allMessages.length]);

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
    setAllMessages((prev) => prev.filter((m) => m.topic !== topic));
  };

  const handleCopyCode = (topic) => {
    const conn = savedConns.find((c) => c.id === selectedId);
    if (!conn) return;
    navigator.clipboard.writeText(generateCSharpConsumer(conn, topic)).then(() => {
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="kafka-panel">
      <div className="kafka-panel-header">
        <span className="kafka-panel-title">Kafka Browser</span>
        <button className="log-close-btn" onClick={onToggle} title="Close">×</button>
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
                      const isListening = !!listeners[topic];
                      const copied = copiedTopic === topic;
                      return (
                        <div key={topic} className={`kafka-topic-row${isListening ? ' kafka-topic-row--listening' : ''}`}>
                          <span className="kafka-topic-name" title={topic}>{topic}</span>
                          <div className="kafka-topic-actions">
                            {isListening
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
                {listenedTopics.length === 0 ? (
                  <div className="kafka-right-empty">Press ▶ on a topic to start a live feed</div>
                ) : (
                  <>
                    <div className="kafka-listener-chips">
                      {listenedTopics.map((topic) => (
                        <span key={topic} className="kafka-listener-chip">
                          {topic}
                          <button className="kafka-chip-stop" onClick={() => handleStopListen(topic)} title="Stop">■</button>
                        </span>
                      ))}
                    </div>
                    <div className="kafka-feed-messages">
                      {allMessages.length === 0 && (
                        <div className="kafka-feed-empty">Waiting for messages…</div>
                      )}
                      {allMessages.map((m, i) => (
                        <div key={i} className="kafka-feed-message">
                          <span className="kafka-msg-stream">{m.topic}</span>
                          <span className="kafka-msg-meta">p{m.partition}·{m.offset}</span>
                          {m.key && <span className="kafka-msg-key">{m.key}</span>}
                          <span className="kafka-msg-value">{m.value ?? '(null)'}</span>
                        </div>
                      ))}
                      <div ref={endRef} />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
