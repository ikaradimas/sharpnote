'use strict';

const path = require('path');
const fs   = require('fs');
const { Kafka, logLevel } = require('kafkajs');

let _savedPath  = '';
let _mainWindow = null;

// Map of consumerId -> { consumer }
const _activeConsumers = new Map();

function setMainWindow(win) { _mainWindow = win; }

function loadKafkaSaved() {
  try { return JSON.parse(fs.readFileSync(_savedPath, 'utf-8')); }
  catch { return []; }
}

function saveKafkaSaved(list) {
  try {
    fs.mkdirSync(path.dirname(_savedPath), { recursive: true });
    fs.writeFileSync(_savedPath, JSON.stringify(list, null, 2), 'utf-8');
  } catch {}
}

function makeKafkaClient(connection) {
  const config = {
    clientId: 'sharpnote',
    brokers: connection.brokers,
    logLevel: logLevel.ERROR,
    connectionTimeout: 5000,
    requestTimeout: 10000,
  };
  if (connection.ssl) config.ssl = true;
  if (connection.sasl) {
    config.ssl = true;
    config.sasl = {
      mechanism: connection.sasl.mechanism,
      username: connection.sasl.username,
      password: connection.sasl.password,
    };
  }
  return new Kafka(config);
}

async function listTopics(connection) {
  const kafka = makeKafkaClient(connection);
  const admin = kafka.admin();
  await admin.connect();
  try {
    const topics = await admin.listTopics();
    topics.sort();
    return { topics };
  } finally {
    await admin.disconnect().catch(() => {});
  }
}

async function consumeStart({ consumerId, connection, topics, maxMessages, fromBeginning, groupId }) {
  await consumeStop(consumerId);

  const kafka  = makeKafkaClient(connection);
  const consumer = kafka.consumer({
    groupId: groupId || `sharpnote-browse-${consumerId}`,
    sessionTimeout: 10000,
    heartbeatInterval: 3000,
  });

  await consumer.connect();

  const topicList = Array.isArray(topics) ? topics : [topics];
  for (const topic of topicList) {
    await consumer.subscribe({ topic, fromBeginning: !!fromBeginning });
  }

  const max = maxMessages || 100;
  // Per-topic count so each topic gets up to maxMessages
  const counts = {};

  _activeConsumers.set(consumerId, { consumer });

  // Run the consumer loop (non-blocking — kafkajs manages its own loop internally)
  consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      if (!_activeConsumers.has(consumerId)) return;
      const topicCount = (counts[topic] || 0);
      if (topicCount >= max) return;
      counts[topic] = topicCount + 1;
      // Stop once every subscribed topic has reached the limit
      if (topicList.every((t) => (counts[t] || 0) >= max)) {
        consumeStop(consumerId).catch(() => {});
      }

      const payload = {
        consumerId,
        topic,
        partition,
        offset: message.offset,
        key:    message.key    ? message.key.toString()    : null,
        value:  message.value  ? message.value.toString()  : null,
        timestamp: message.timestamp,
        headers: Object.fromEntries(
          Object.entries(message.headers || {}).map(([k, v]) => [k, v ? v.toString() : null])
        ),
      };

      if (_mainWindow && !_mainWindow.isDestroyed()) {
        _mainWindow.webContents.send('kafka-message', payload);
      }
    },
  }).catch(() => {
    _activeConsumers.delete(consumerId);
  });

  return { ok: true };
}

async function consumeStop(consumerId) {
  const entry = _activeConsumers.get(consumerId);
  if (!entry) return { ok: true };
  _activeConsumers.delete(consumerId);
  try { await entry.consumer.disconnect(); } catch {}
  return { ok: true };
}

async function stopAll() {
  const ids = [..._activeConsumers.keys()];
  await Promise.all(ids.map((id) => consumeStop(id)));
}

function register(ipcMain, { app }) {
  _savedPath = path.join(app.getPath('userData'), 'kafka-saved.json');

  ipcMain.handle('kafka-saved-load',   ()          => loadKafkaSaved());
  ipcMain.handle('kafka-saved-save',   (_e, list)  => saveKafkaSaved(list));
  ipcMain.handle('kafka-topics-list',  (_e, conn)  => listTopics(conn));
  ipcMain.handle('kafka-consume-start',(_e, opts)  => consumeStart(opts));
  ipcMain.handle('kafka-consume-stop', (_e, id)    => consumeStop(id));
}

module.exports = { setMainWindow, stopAll, register };
