// ── DB provider configuration ─────────────────────────────────────────────────

export const DB_PROVIDERS = [
  { key: 'sqlite',        label: 'SQLite' },
  { key: 'sqlite_memory', label: 'SQLite (In-Memory)', optionalConnStr: true },
  { key: 'sqlserver',     label: 'SQL Server' },
  { key: 'postgresql',    label: 'PostgreSQL' },
  { key: 'redis',         label: 'Redis' },
];

export const DB_CONNSTR_PLACEHOLDER = {
  sqlite:        'Data Source=/path/to/db.sqlite',
  sqlite_memory: 'Shared memory name (leave blank to auto-generate)',
  sqlserver:     'Server=...;Database=...;User Id=...;Password=...;TrustServerCertificate=True',
  postgresql:    'Host=...;Database=...;Username=...;Password=...;',
  redis:         'localhost:6379  or  server:port,password=secret',
};
