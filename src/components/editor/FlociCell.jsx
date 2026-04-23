import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Play, Square, Monitor, Cloud, Clock, Wifi, X, ScrollText, Terminal, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { CellNameColor } from './CellNameColor.jsx';
import { CellControls } from './CellControls.jsx';
import { CellOutput } from '../output/OutputBlock.jsx';

// ── AWS service catalogue ────────────────────────────────────────────────────

const PRIMARY_SERVICES = [
  { key: 's3',         label: 'S3' },
  { key: 'dynamodb',   label: 'DynamoDB' },
  { key: 'sqs',        label: 'SQS' },
  { key: 'lambda',     label: 'Lambda' },
  { key: 'sns',        label: 'SNS' },
  { key: 'rds',        label: 'RDS' },
  { key: 'elasticache', label: 'ElastiCache' },
  { key: 'iam',        label: 'IAM' },
  { key: 'kms',        label: 'KMS' },
  { key: 'sts',        label: 'STS' },
  { key: 'cloudwatch', label: 'CloudWatch' },
  { key: 'ecs',        label: 'ECS' },
];

const MORE_SERVICES = [
  { key: 'apigateway',     label: 'API Gateway' },
  { key: 'cloudformation', label: 'CloudFormation' },
  { key: 'eventbridge',    label: 'EventBridge' },
  { key: 'kinesis',        label: 'Kinesis' },
  { key: 'secretsmanager', label: 'Secrets Manager' },
  { key: 'ssm',            label: 'SSM' },
  { key: 'stepfunctions',  label: 'Step Functions' },
  { key: 'cognito',        label: 'Cognito' },
  { key: 'opensearch',     label: 'OpenSearch' },
  { key: 'msk',            label: 'MSK' },
  { key: 'eks',            label: 'EKS' },
  { key: 'ecr',            label: 'ECR' },
];

const REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-northeast-1'];
const STORAGE_MODES = ['memory', 'persistent', 'hybrid'];

// ── SDK snippet generation ───────────────────────────────────────────────────

const SDK_MAP = {
  s3:             { pkg: 'AWSSDK.S3',                 ns: 'Amazon.S3',                  client: 'AmazonS3Client',                  config: 'AmazonS3Config',                  extra: 'ForcePathStyle = true' },
  dynamodb:       { pkg: 'AWSSDK.DynamoDBv2',         ns: 'Amazon.DynamoDBv2',          client: 'AmazonDynamoDBClient',            config: 'AmazonDynamoDBConfig' },
  sqs:            { pkg: 'AWSSDK.SQS',                ns: 'Amazon.SQS',                 client: 'AmazonSQSClient',                 config: 'AmazonSQSConfig' },
  sns:            { pkg: 'AWSSDK.SimpleNotificationService', ns: 'Amazon.SimpleNotificationService', client: 'AmazonSimpleNotificationServiceClient', config: 'AmazonSimpleNotificationServiceConfig' },
  lambda:         { pkg: 'AWSSDK.Lambda',             ns: 'Amazon.Lambda',               client: 'AmazonLambdaClient',              config: 'AmazonLambdaConfig' },
  rds:            { pkg: 'AWSSDK.RDS',                ns: 'Amazon.RDS',                  client: 'AmazonRDSClient',                 config: 'AmazonRDSConfig' },
  iam:            { pkg: 'AWSSDK.IdentityManagement', ns: 'Amazon.IdentityManagement',   client: 'AmazonIdentityManagementServiceClient', config: 'AmazonIdentityManagementServiceConfig' },
  kms:            { pkg: 'AWSSDK.KeyManagementService', ns: 'Amazon.KeyManagementService', client: 'AmazonKeyManagementServiceClient', config: 'AmazonKeyManagementServiceConfig' },
  sts:            { pkg: 'AWSSDK.SecurityToken',      ns: 'Amazon.SecurityToken',        client: 'AmazonSecurityTokenServiceClient', config: 'AmazonSecurityTokenServiceConfig' },
  cloudwatch:     { pkg: 'AWSSDK.CloudWatch',         ns: 'Amazon.CloudWatch',           client: 'AmazonCloudWatchClient',          config: 'AmazonCloudWatchConfig' },
  secretsmanager: { pkg: 'AWSSDK.SecretsManager',     ns: 'Amazon.SecretsManager',       client: 'AmazonSecretsManagerClient',      config: 'AmazonSecretsManagerConfig' },
  ssm:            { pkg: 'AWSSDK.SimpleSystemsManagement', ns: 'Amazon.SimpleSystemsManagement', client: 'AmazonSimpleSystemsManagementClient', config: 'AmazonSimpleSystemsManagementConfig' },
  kinesis:        { pkg: 'AWSSDK.Kinesis',            ns: 'Amazon.Kinesis',              client: 'AmazonKinesisClient',             config: 'AmazonKinesisConfig' },
  stepfunctions:  { pkg: 'AWSSDK.StepFunctions',      ns: 'Amazon.StepFunctions',        client: 'AmazonStepFunctionsClient',       config: 'AmazonStepFunctionsConfig' },
};

function generateSnippet(services, endpoint, region) {
  const enabled = services.filter((s) => SDK_MAP[s]);
  if (enabled.length === 0) return '// No SDK-supported services selected';

  const nugets = enabled.map((s) => `#r "nuget: ${SDK_MAP[s].pkg}"`).join('\n');
  const usings = ['using Amazon.Runtime;', ...enabled.map((s) => `using ${SDK_MAP[s].ns};`)].join('\n');

  const clients = enabled.map((s) => {
    const m = SDK_MAP[s];
    const extras = m.extra ? `, ${m.extra}` : '';
    return `var ${s}Client = new ${m.client}(\n    new BasicAWSCredentials("test", "test"),\n    new ${m.config} { ServiceURL = "${endpoint}", AuthenticationRegion = "${region}"${extras} });`;
  }).join('\n\n');

  return `${nugets}\n\n${usings}\n\n${clients}`;
}

// ── Shared sub-components (from DockerCell pattern) ──────────────────────────

function StatusBadge({ state }) {
  const cls = state === 'running' ? 'docker-badge-running'
            : state === 'error'   ? 'docker-badge-error'
            : 'docker-badge-stopped';
  const label = state === 'running' ? 'Running'
              : state === 'error'   ? 'Error'
              : 'Stopped';
  return <span className={`docker-status-badge ${cls}`}>{label}</span>;
}

function StatsRow({ stats }) {
  if (!stats) return null;
  const formatMem = (bytes) => {
    if (!bytes && bytes !== 0) return '—';
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };
  return (
    <div className="docker-stats-row">
      <span className="docker-stat-label">CPU:</span>
      <span className="docker-stat-value">{stats.cpuPercent != null ? `${stats.cpuPercent.toFixed(1)}%` : '—'}</span>
      <span className="docker-stat-label">Mem:</span>
      <span className="docker-stat-value">
        {formatMem(stats.memUsage)}{stats.memLimit ? ` / ${formatMem(stats.memLimit)}` : ''}
      </span>
    </div>
  );
}

function LogsPopup({ logs, onClose, onRefresh }) {
  const preRef = useRef(null);
  useEffect(() => { if (preRef.current) preRef.current.scrollTop = preRef.current.scrollHeight; }, [logs]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="docker-logs-overlay" onClick={onClose}>
      <div className="docker-logs-popup" onClick={(e) => e.stopPropagation()}>
        <div className="docker-logs-header">
          <ScrollText size={14} />
          <span className="docker-logs-title">Container Logs</span>
          <button className="docker-logs-refresh" onClick={onRefresh} title="Refresh logs">↻</button>
          <button className="docker-logs-close" onClick={onClose} title="Close"><X size={14} /></button>
        </div>
        <pre ref={preRef} className="docker-logs-content">{logs || '(no logs)'}</pre>
      </div>
    </div>
  );
}

function ExecSection({ notebookId, cellId, containerId }) {
  const [execOpen, setExecOpen] = useState(false);
  const [execOutput, setExecOutput] = useState([]);
  const [execInput, setExecInput] = useState('');
  const [execActive, setExecActive] = useState(false);
  const outputRef = useRef(null);

  useEffect(() => {
    if (!execActive || !window.electronAPI) return;
    const handler = (_ev, nbId, msg) => {
      if (nbId !== notebookId) return;
      if (msg.type === 'docker_exec_output' && msg.id === cellId) setExecOutput((prev) => [...prev.slice(-500), msg.data || '']);
      if (msg.type === 'docker_exec_ended' && msg.id === cellId) setExecActive(false);
    };
    window.electronAPI.onKernelMessage(handler);
    return () => window.electronAPI.offKernelMessage(handler);
  }, [execActive, notebookId, cellId]);

  useEffect(() => { if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight; }, [execOutput]);

  const handleAttach = () => {
    setExecOutput([]); setExecActive(true); setExecOpen(true);
    window.electronAPI?.sendToKernel(notebookId, { type: 'docker_exec', id: cellId, containerId });
  };
  const handleSend = () => {
    if (!execInput.trim()) return;
    window.electronAPI?.sendToKernel(notebookId, { type: 'docker_exec_input', id: cellId, containerId, input: execInput + '\n' });
    setExecOutput((prev) => [...prev, `$ ${execInput}\n`]);
    setExecInput('');
  };

  if (!execOpen) return (
    <div className="docker-exec-section">
      <button className="docker-logs-btn" onClick={handleAttach} title="Attach shell"><Terminal size={12} /></button>
    </div>
  );

  return (
    <div className="docker-exec-section">
      <div className="docker-exec-header">
        <Terminal size={12} /><span>Exec{execActive ? '' : ' (disconnected)'}</span>
        <button className="docker-logs-close" onClick={() => { setExecOpen(false); setExecActive(false); }} title="Close"><X size={12} /></button>
      </div>
      {execOutput.length > 0 && <pre ref={outputRef} className="docker-logs-content" style={{ maxHeight: 150, margin: '0 8px', borderRadius: 3 }}>{execOutput.join('')}</pre>}
      <div className="docker-exec-input-row">
        <input className="docker-exec-input" value={execInput} onChange={(e) => setExecInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSend(); } }}
          placeholder={execActive ? 'Type command...' : 'Disconnected'} disabled={!execActive} spellCheck={false} />
        <button className="docker-exec-send" onClick={handleSend} disabled={!execActive}>Send</button>
      </div>
    </div>
  );
}

// ── Snippet popup ────────────────────────────────────────────────────────────

function SnippetPopup({ snippet, onClose, onInsert }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(snippet).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };

  return (
    <div className="docker-logs-overlay" onClick={onClose}>
      <div className="docker-logs-popup floci-snippet-popup" onClick={(e) => e.stopPropagation()}>
        <div className="docker-logs-header">
          <Cloud size={14} />
          <span className="docker-logs-title">C# SDK Snippet</span>
          <button className="docker-logs-close" onClick={onClose} title="Close"><X size={14} /></button>
        </div>
        <pre className="docker-logs-content floci-snippet-code">{snippet}</pre>
        <div className="floci-snippet-actions">
          <button className="docker-btn" onClick={handleCopy}><Copy size={12} /> {copied ? 'Copied!' : 'Copy'}</button>
          {onInsert && <button className="docker-btn floci-btn-primary" onClick={() => { onInsert(snippet); onClose(); }}>Insert as Code Cell</button>}
        </div>
      </div>
    </div>
  );
}

// ── Service checkbox grid ────────────────────────────────────────────────────

function ServiceGrid({ services, onChange }) {
  const [showMore, setShowMore] = useState(false);
  const set = new Set(services || []);

  const toggle = (key) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange([...next]);
  };

  return (
    <div className="floci-services-section">
      <span className="docker-field-label">Services</span>
      <div className="floci-services-grid">
        {PRIMARY_SERVICES.map((s) => (
          <label key={s.key} className="floci-service-checkbox">
            <input type="checkbox" checked={set.has(s.key)} onChange={() => toggle(s.key)} />
            <span>{s.label}</span>
          </label>
        ))}
      </div>
      <button className="floci-more-toggle" onClick={() => setShowMore((v) => !v)}>
        {showMore ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {showMore ? 'Less' : 'More services'}
      </button>
      {showMore && (
        <div className="floci-services-grid">
          {MORE_SERVICES.map((s) => (
            <label key={s.key} className="floci-service-checkbox">
              <input type="checkbox" checked={set.has(s.key)} onChange={() => toggle(s.key)} />
              <span>{s.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function FlociCell({
  cell, cellIndex, outputs, notebookId,
  isRunning, anyRunning, kernelReady = true,
  onUpdate, onRun, onStopDocker, onPollDockerStatus, onFetchDockerLogs,
  onInsertCodeCell,
  onDelete, onCopy, onMoveUp, onMoveDown,
  onToggleBookmark,
  onNameChange, onColorChange,
}) {
  const presenting = cell.presenting || false;
  const containerId = cell.containerId || null;
  const containerState = cell.containerState || 'stopped';
  const [logsOpen, setLogsOpen] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [stats, setStats] = useState(null);

  // Auto-poll status every 5s in presentation mode when running
  useEffect(() => {
    if (!presenting || !containerId || containerState !== 'running') return;
    const id = setInterval(() => onPollDockerStatus?.(notebookId, cell.id, containerId), 5000);
    return () => clearInterval(id);
  }, [presenting, containerId, containerState, notebookId, cell.id, onPollDockerStatus]);

  // Poll docker stats every 5s when container is running
  useEffect(() => {
    if (!containerId || containerState !== 'running' || !window.electronAPI) return;
    const handler = (_ev, nbId, msg) => {
      if (nbId !== notebookId || msg.type !== 'docker_stats' || msg.id !== cell.id) return;
      setStats({ cpuPercent: msg.cpuPercent, memUsage: msg.memUsage, memLimit: msg.memLimit });
    };
    window.electronAPI.onKernelMessage(handler);
    const poll = () => window.electronAPI.sendToKernel(notebookId, { type: 'docker_stats', id: cell.id, containerId });
    poll();
    const id = setInterval(poll, 5000);
    return () => { clearInterval(id); window.electronAPI.offKernelMessage(handler); setStats(null); };
  }, [containerId, containerState, notebookId, cell.id]);

  const handleStop = () => { if (containerId) onStopDocker?.(notebookId, cell.id, containerId); };
  const updateField = (field, value) => onUpdate?.({ [field]: value });

  const handleOpenLogs = () => {
    if (containerId) { onFetchDockerLogs?.(notebookId, cell.id, containerId); setLogsOpen(true); }
  };
  const handleRefreshLogs = () => { if (containerId) onFetchDockerLogs?.(notebookId, cell.id, containerId); };

  const logsButton = containerId ? (
    <button className="docker-logs-btn" onClick={handleOpenLogs} title="Container logs"><ScrollText size={12} /></button>
  ) : null;

  const endpoint = cell.endpoint || 'http://localhost:4566';
  const region = cell.region || 'us-east-1';
  const snippet = generateSnippet(cell.services || [], endpoint, region);

  const canStart = (cell.services || []).length > 0 && kernelReady;

  // ── Presentation mode ──────────────────────────────────────────────────────
  if (presenting) {
    return (
      <div className={`cell docker-cell floci-cell floci-presenting${containerState === 'running' ? ' docker-running floci-running' : ''}`}>
        <div className="docker-present-header">
          <Cloud size={20} className="docker-present-icon floci-icon" />
          <div className="docker-present-title">
            <span className="docker-present-name">{cell.name || 'Floci'}</span>
            <span className="docker-present-image">{endpoint}</span>
          </div>
          <StatusBadge state={containerState} />
          {logsButton}
          <button className="docker-present-exit" title="Exit presentation" onClick={() => updateField('presenting', false)}><X size={14} /></button>
        </div>
        <div className="docker-present-details">
          <div className="docker-detail-chip"><Cloud size={12} /> {region}</div>
          <div className="docker-detail-chip"><Wifi size={12} /> {endpoint}</div>
          {(cell.services || []).length > 0 && <div className="docker-detail-chip">{(cell.services || []).join(', ')}</div>}
          {containerId && <div className="docker-detail-chip">ID: {containerId}</div>}
        </div>
        <StatsRow stats={stats} />
        <div className="docker-present-controls">
          {containerState === 'running' ? (
            <button className="docker-btn docker-btn-stop" onClick={handleStop}><Square size={14} /> Stop</button>
          ) : (
            <button className="docker-btn docker-btn-start" onClick={onRun} disabled={!canStart}><Play size={14} /> Start</button>
          )}
        </div>
        {containerState === 'running' && containerId && <ExecSection notebookId={notebookId} cellId={cell.id} containerId={containerId} />}
        <CellOutput messages={outputs} notebookId={notebookId} />
        {logsOpen && <LogsPopup logs={cell.containerLogs} onClose={() => setLogsOpen(false)} onRefresh={handleRefreshLogs} />}
      </div>
    );
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  return (
    <div className={`cell docker-cell floci-cell${isRunning ? ' running' : ''}${containerState === 'running' ? ' docker-running floci-running' : ''}`}>
      <span className="cell-index-badge">{cellIndex + 1}</span>
      <div className="code-cell-header">
        <CellNameColor name={cell.name} color={cell.color} onNameChange={onNameChange} onColorChange={onColorChange} />
        <span className="cell-lang-label floci-label">Floci</span>
        {containerId && <StatusBadge state={containerState} />}
        {logsButton}
        <span className="cell-id-label">{cell.id}</span>
        <div className="cell-run-group">
          {containerState === 'running' ? (
            <button className="cell-run-btn cell-stop-btn" onClick={handleStop} title="Stop container"><Square size={12} /> Stop</button>
          ) : isRunning ? (
            <button className="cell-run-btn" disabled><Clock size={12} /> Starting</button>
          ) : (
            <button className="cell-run-btn" onClick={onRun} disabled={anyRunning || !canStart} title="Start Floci"><Play size={12} /> Run</button>
          )}
          <button className="floci-snippet-btn" title="SDK Snippet" onClick={() => setSnippetOpen(true)} disabled={(cell.services || []).length === 0}>
            <Copy size={12} /> SDK
          </button>
          <button className={`cell-present-btn${presenting ? ' active' : ''}`} title="Presentation mode" onClick={() => updateField('presenting', !presenting)}>
            <Monitor size={12} />
          </button>
        </div>
        <CellControls onCopy={onCopy} onMoveUp={onMoveUp} onMoveDown={onMoveDown} onDelete={onDelete}
          bookmarked={cell.bookmarked} onToggleBookmark={onToggleBookmark} />
      </div>

      <div className="docker-config-form floci-config-form">
        <div className="floci-config-row">
          <label className="docker-field">
            <span className="docker-field-label">Endpoint</span>
            <input className="docker-field-input docker-mono" value={endpoint} onChange={(e) => updateField('endpoint', e.target.value)} spellCheck={false} />
          </label>
          <label className="docker-field floci-select-field">
            <span className="docker-field-label">Region</span>
            <select className="docker-field-input" value={region} onChange={(e) => updateField('region', e.target.value)}>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label className="docker-field floci-select-field">
            <span className="docker-field-label">Storage</span>
            <select className="docker-field-input" value={cell.storageMode || 'memory'} onChange={(e) => updateField('storageMode', e.target.value)}>
              {STORAGE_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>

        <ServiceGrid services={cell.services || []} onChange={(v) => updateField('services', v)} />

        <label className="docker-field">
          <span className="docker-field-label">Init Script <span className="floci-hint">(runs after container starts)</span></span>
          <textarea
            className="docker-field-input docker-mono floci-init-script"
            value={cell.initScript || ''}
            onChange={(e) => updateField('initScript', e.target.value)}
            placeholder="aws s3 mb s3://my-bucket --endpoint-url=http://localhost:4566"
            spellCheck={false}
            rows={3}
          />
        </label>

        <div className="docker-lifecycle-row">
          <label className="docker-checkbox">
            <input type="checkbox" checked={!!cell.runOnStartup} onChange={(e) => updateField('runOnStartup', e.target.checked)} />
            <span>Run on startup</span>
          </label>
        </div>
      </div>

      <StatsRow stats={stats} />

      {containerState === 'running' && containerId && <ExecSection notebookId={notebookId} cellId={cell.id} containerId={containerId} />}

      <CellOutput messages={outputs} notebookId={notebookId} />
      {logsOpen && <LogsPopup logs={cell.containerLogs} onClose={() => setLogsOpen(false)} onRefresh={handleRefreshLogs} />}
      {snippetOpen && <SnippetPopup snippet={snippet} onClose={() => setSnippetOpen(false)} onInsert={onInsertCodeCell} />}
    </div>
  );
}
