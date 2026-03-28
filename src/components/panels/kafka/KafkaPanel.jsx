import React from 'react';

export function KafkaPanel({ onToggle }) {
  return (
    <div className="kafka-panel">
      <div className="panel-header">
        <span className="panel-title">Kafka Browser</span>
        <button className="log-close-btn" onClick={onToggle} title="Close">×</button>
      </div>
      <div className="kafka-panel-body">
        {/* Implemented in Steps 3–5 */}
      </div>
    </div>
  );
}
