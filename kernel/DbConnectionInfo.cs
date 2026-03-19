using Microsoft.CodeAnalysis;
using SharpNoteKernel.Db;

namespace SharpNoteKernel;

// ── DB connection info record ─────────────────────────────────────────────────

record DbConnectionInfo(string Id, string Name, string Provider,
    string ConnectionString, string VarName, MetadataReference MetaRef, DbSchema Schema);
