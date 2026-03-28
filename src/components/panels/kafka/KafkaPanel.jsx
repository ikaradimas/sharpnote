import React, { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';

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
    if (!n)       { setError('Name is required.'); return; }
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
      <input
        className="nuget-input"
        placeholder="Connection name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        spellCheck={false}
      />
      <input
        className="nuget-input"
        placeholder="Brokers (comma-separated, e.g. host:9092)"
        value={brokers}
        onChange={(e) => setBrokers(e.target.value)}
        spellCheck={false}
      />
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

// ── Message feed ──────────────────────────────────────────────────────────────

function MessageFeed({ topic, messages, onStop }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  return (
    <div className="kafka-feed">
      <div className="kafka-feed-header">
        <span className="kafka-feed-topic">{topic}</span>
        <span className="kafka-feed-count">{messages.length} msg{messages.length !== 1 ? 's' : ''}</span>
        <button className="kafka-btn kafka-btn-stop" onClick={onStop} title="Stop listening">■ Stop</button>
      </div>
      <div className="kafka-feed-messages">
        {messages.length === 0 && <div className="kafka-feed-empty">Waiting for messages…</div>}
        {messages.map((m, i) => (
          <div key={i} className="kafka-feed-message">
            <span className="kafka-msg-meta">p{m.partition}·{m.offset}</span>
            {m.key && <span className="kafka-msg-key">{m.key}</span>}
            <span className="kafka-msg-value">{m.value ?? '(null)'}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function KafkaPanel({ onToggle }) {
  const [savedConns,    setSavedConns]    = useState([]);
  const [selectedId,    setSelectedId]    = useState(null);
  const [formConn,      setFormConn]      = useState(null); // null=hidden, {}=add, {id,...}=edit
  const [topics,        setTopics]        = useState([]);
  const [topicFilter,   setTopicFilter]   = useState('');
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [topicError,    setTopicError]    = useState('');
  const [maxMessages,   setMaxMessages]   = useState(100);
  // Map of topic -> { consumerId, messages[] }
  const [listeners, setListeners] = useState({});
  const listenerConsumerIds = useRef({});
  const [copiedTopic, setCopiedTopic] = useState(null);

  // Load saved connections on mount
  useEffect(() => {
    window.electronAPI.loadKafkaSaved().then((list) => {
      setSavedConns(list || []);
    });
  }, []);

  // Listen for incoming Kafka messages
  useEffect(() => {
    const handler = (payload) => {
      const { consumerId, topic, ...msg } = payload;
      setListeners((prev) => {
        const entry = Object.values(prev).find((e) => e.consumerId === consumerId);
        if (!entry) return prev;
        const key = topic;
        const existing = prev[key];
        if (!existing) return prev;
        return {
          ...prev,
          [key]: {
            ...existing,
            messages: [...existing.messages, msg].slice(-maxMessages),
          },
        };
      });
    };
    window.electronAPI.onKafkaMessage(handler);
    return () => window.electronAPI.offKafkaMessage(handler);
  }, [maxMessages]);

  // Stop all listeners when panel unmounts
  useEffect(() => {
    return () => {
      Object.values(listenerConsumerIds.current).forEach((id) => {
        window.electronAPI.kafkaConsumeStop(id).catch(() => {});
      });
    };
  }, []);

  const persist = useCallback((list) => {
    setSavedConns(list);
    window.electronAPI.saveKafkaSaved(list);
  }, []);

  const handleSaveConn = (conn) => {
    const existing = savedConns.find((c) => c.id === conn.id);
    const updated  = existing
      ? savedConns.map((c) => c.id === conn.id ? conn : c)
      : [...savedConns, conn];
    persist(updated);
    setFormConn(null);
  };

  const handleDeleteConn = (id) => {
    if (selectedId === id) {
      setSelectedId(null);
      setTopics([]);
      setTopicError('');
    }
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
        brokers: conn.brokers,
        ssl: conn.ssl,
        sasl: conn.sasl,
      });
      setTopics(result.topics || []);
    } catch (err) {
      setTopicError(err?.message || 'Failed to connect');
    } finally {
      setLoadingTopics(false);
    }
  };

  const handleListen = async (topic) => {
    if (listeners[topic]) return; // already listening
    const conn = savedConns.find((c) => c.id === selectedId);
    if (!conn) return;
    const consumerId = uuidv4();
    listenerConsumerIds.current[topic] = consumerId;
    setListeners((prev) => ({ ...prev, [topic]: { consumerId, messages: [] } }));
    try {
      await window.electronAPI.kafkaConsumeStart({
        consumerId,
        connection: { brokers: conn.brokers, ssl: conn.ssl, sasl: conn.sasl },
        topics: [topic],
        maxMessages,
      });
    } catch (err) {
      setListeners((prev) => {
        const next = { ...prev };
        delete next[topic];
        return next;
      });
      delete listenerConsumerIds.current[topic];
    }
  };

  const handleStopListen = async (topic) => {
    const consumerId = listenerConsumerIds.current[topic];
    if (consumerId) {
      await window.electronAPI.kafkaConsumeStop(consumerId).catch(() => {});
      delete listenerConsumerIds.current[topic];
    }
    setListeners((prev) => {
      const next = { ...prev };
      delete next[topic];
      return next;
    });
  };

  const handleCopyCode = (topic) => {
    const conn = savedConns.find((c) => c.id === selectedId);
    if (!conn) return;
    const code = generateCSharpConsumer(conn, topic);
    navigator.clipboard.writeText(code).then(() => {
      setCopiedTopic(topic);
      setTimeout(() => setCopiedTopic(null), 2000);
    });
  };

  const selectedConn  = savedConns.find((c) => c.id === selectedId) ?? null;
  const existingNames = savedConns.map((c) => c.name);
  const filteredTopics = topics.filter((t) =>
    !topicFilter || t.toLowerCase().includes(topicFilter.toLowerCase())
  );

  const listenedTopics = Object.keys(listeners);

  return (
    <div className="kafka-panel">
      {/* ── Header ── */}
      <div className="kafka-panel-header">
        <span className="kafka-panel-title">Kafka Browser</span>
        <button className="log-close-btn" onClick={onToggle} title="Close">×</button>
      </div>

      <div className="kafka-panel-body">
        {/* ── Left: connection list ── */}
        <div className="kafka-conn-list">
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
                <button
                  className="kafka-btn kafka-btn-connect"
                  onClick={() => handleConnect(conn)}
                  title="Connect and list topics"
                >→</button>
                <button
                  className="kafka-btn"
                  onClick={() => setFormConn(conn)}
                  title="Edit"
                >✎</button>
                <button
                  className="kafka-btn kafka-btn-danger"
                  onClick={() => handleDeleteConn(conn.id)}
                  title="Delete"
                >✕</button>
              </div>
            </div>
          ))}

          {/* max messages config */}
          <div className="kafka-max-row">
            <span className="kafka-section-label">Max messages</span>
            <input
              className="kafka-max-input"
              type="number"
              min={1}
              max={10000}
              value={maxMessages}
              onChange={(e) => setMaxMessages(Math.max(1, parseInt(e.target.value) || 100))}
            />
          </div>
        </div>

        {/* ── Right: topics + feeds ── */}
        <div className="kafka-right">
          {!selectedConn && (
            <div className="kafka-right-empty">Select a broker to browse topics</div>
          )}

          {selectedConn && (
            <>
              {/* Topic list */}
              <div className="kafka-topics-section">
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
                            {isListening ? (
                              <button className="kafka-btn kafka-btn-stop" onClick={() => handleStopListen(topic)} title="Stop listening">■</button>
                            ) : (
                              <button className="kafka-btn kafka-btn-listen" onClick={() => handleListen(topic)} title="Listen">▶</button>
                            )}
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

              {/* Active message feeds */}
              {listenedTopics.length > 0 && (
                <div className="kafka-feeds-section">
                  <div className="kafka-section-label kafka-feeds-label">Live feeds</div>
                  {listenedTopics.map((topic) => (
                    <MessageFeed
                      key={topic}
                      topic={topic}
                      messages={listeners[topic]?.messages ?? []}
                      onStop={() => handleStopListen(topic)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
