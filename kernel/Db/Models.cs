using System.Collections.Generic;

namespace SharpNoteKernel.Db;

// ── Schema models ─────────────────────────────────────────────────────────────

public record DbSchema(string ConnectionId, string DatabaseName, List<TableSchema> Tables);
public record TableSchema(string Schema, string Name, List<ColumnSchema> Columns);
public record ColumnSchema(string Name, string DbType, string CSharpType,
    bool IsPrimaryKey, bool IsNullable, bool IsIdentity);
