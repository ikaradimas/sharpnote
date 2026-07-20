using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

namespace SharpNoteKernel.Db;

public static class DbCodeGen
{
    // Escape a string for embedding as a C# string literal (backslash + quote)
    private static string Esc(string s) => s.Replace("\\", "\\\\").Replace("\"", "\\\"");

    // ── Name sanitization ─────────────────────────────────────────────────────

    /// <summary>Returns a camelCase, alpha-only variable name from a human name.</summary>
    public static string SanitizeVarName(string name)
    {
        var pascal = SanitizeTypeName(name);
        if (pascal.Length == 0) return "db";
        return char.ToLowerInvariant(pascal[0]) + pascal[1..];
    }

    /// <summary>Returns a PascalCase, alpha-only type name from a human name.</summary>
    public static string SanitizeTypeName(string name)
    {
        if (string.IsNullOrWhiteSpace(name)) return "Db";
        // Split on non-alphanumeric boundaries, capitalize each word
        var parts = Regex.Split(name.Trim(), @"[^a-zA-Z0-9]+")
                         .Where(p => p.Length > 0)
                         .Select(p => char.ToUpperInvariant(p[0]) + p[1..]);
        var result = string.Concat(parts);
        // Ensure starts with a letter
        if (result.Length == 0) return "Db";
        if (char.IsDigit(result[0])) result = "Db" + result;
        return result;
    }

    /// <summary>Returns the fully-qualified DbContext type name for a connection.</summary>
    public static string ContextTypeName(string connectionName, string? nsSuffix = null)
    {
        var typeName = SanitizeTypeName(connectionName);
        var ns = nsSuffix != null ? $"DynDb_{typeName}_{nsSuffix}" : $"DynDb_{typeName}";
        return $"{ns}.{typeName}DbContext";
    }

    private static readonly Dictionary<string, string> Irregulars = new()
    {
        ["People"] = "Person", ["Children"] = "Child",
        ["Men"] = "Man", ["Women"] = "Woman",
    };

    /// <summary>
    /// Best-effort English singularization of a PascalCase type name (e.g. "Purchases" →
    /// "Purchase", "Categories" → "Category", "Boxes" → "Box"). Returns the input unchanged
    /// when it does not look plural. This is a convenience only — the plural class name is
    /// always the real type.
    /// </summary>
    public static string Singularize(string name)
    {
        if (string.IsNullOrEmpty(name)) return name;
        if (Irregulars.TryGetValue(name, out var irregular)) return irregular;
        // Words that end in these are typically already singular ("Address", "Status", "Analysis").
        if (name.EndsWith("ss") || name.EndsWith("us") || name.EndsWith("is")) return name;
        if (name.EndsWith("ies") && name.Length > 4) return name[..^3] + "y"; // Categories → Category
        // Drop "es" only after a true sibilant, where "-es" is the plural marker.
        if (name.EndsWith("sses") || name.EndsWith("ches") || name.EndsWith("shes") ||
            name.EndsWith("xes")  || name.EndsWith("zes"))
            return name[..^2];                                               // Addresses → Address, Batches → Batch, Boxes → Box
        if (name.EndsWith("s") && name.Length > 1) return name[..^1];        // Purchases → Purchase, Orders → Order, Houses → House
        return name;
    }

    /// <summary>
    /// For each table, returns its generated POCO class name and an optional singular alias.
    /// The alias is null when it would not differ from the class name or would collide with
    /// another table's class name or an earlier alias. Single source of truth shared by the
    /// db_schema payload, the LSP preamble, and the runtime injection.
    /// </summary>
    public static List<(TableSchema Table, string TypeName, string? Alias)> TableTypeInfo(DbSchema schema)
    {
        var classNames = new HashSet<string>(schema.Tables.Select(t => SanitizeTypeName(t.Name)));
        var claimed    = new HashSet<string>(classNames);
        var result     = new List<(TableSchema, string, string?)>(schema.Tables.Count);
        foreach (var t in schema.Tables)
        {
            var typeName = SanitizeTypeName(t.Name);
            var singular = Singularize(typeName);
            string? alias = (singular != typeName && claimed.Add(singular)) ? singular : null;
            result.Add((t, typeName, alias));
        }
        return result;
    }

    // ── Code generation ───────────────────────────────────────────────────────

    public static string GenerateSource(string connectionName, IDbProvider provider, DbSchema schema, string? nsSuffix = null)
    {
        var typeName  = SanitizeTypeName(connectionName);
        var ns        = nsSuffix != null ? $"DynDb_{typeName}_{nsSuffix}" : $"DynDb_{typeName}";
        var ctxClass  = $"{typeName}DbContext";
        var sb        = new StringBuilder();

        sb.AppendLine("using System;");
        sb.AppendLine("using System.Collections.Generic;");
        sb.AppendLine("using Microsoft.EntityFrameworkCore;");
        sb.AppendLine(provider.GetUsingDirectives());
        sb.AppendLine();
        sb.AppendLine($"namespace {ns}");
        sb.AppendLine("{");

        // Generate a POCO class per table
        foreach (var table in schema.Tables)
        {
            var className = SanitizeTypeName(table.Name);
            sb.AppendLine($"    public class {className}");
            sb.AppendLine("    {");
            foreach (var col in table.Columns)
            {
                var propName = SanitizeTypeName(col.Name);
                sb.AppendLine($"        public {col.CSharpType} {propName} {{ get; set; }}");
            }
            sb.AppendLine("    }");
            sb.AppendLine();
        }

        // Generate DbContext subclass
        sb.AppendLine($"    public class {ctxClass} : DbContext");
        sb.AppendLine("    {");
        if (provider.UsesPersistentConnection)
        {
            // In-memory SQLite: take a persistent SqliteConnection so the DB is not destroyed between queries
            sb.AppendLine("        private readonly Microsoft.Data.Sqlite.SqliteConnection _conn;");
            sb.AppendLine();
            sb.AppendLine($"        public {ctxClass}(Microsoft.Data.Sqlite.SqliteConnection conn)");
            sb.AppendLine("        {");
            sb.AppendLine("            _conn = conn;");
            sb.AppendLine("        }");
            sb.AppendLine();
            sb.AppendLine("        protected override void OnConfiguring(DbContextOptionsBuilder b)");
            sb.AppendLine("        {");
            sb.AppendLine("            b.UseSqlite(_conn);");
            sb.AppendLine("        }");
        }
        else
        {
            sb.AppendLine("        private readonly string _cs;");
            sb.AppendLine("        private readonly string _provider;");
            sb.AppendLine();
            sb.AppendLine($"        public {ctxClass}(string cs, string provider)");
            sb.AppendLine("        {");
            sb.AppendLine("            _cs = cs;");
            sb.AppendLine("            _provider = provider;");
            sb.AppendLine("        }");
            sb.AppendLine();
            sb.AppendLine("        protected override void OnConfiguring(DbContextOptionsBuilder b)");
            sb.AppendLine("        {");
            sb.AppendLine($"            {provider.GetConfigureCallCode("_cs")};");
            sb.AppendLine("        }");
        }
        sb.AppendLine();

        // OnModelCreating — explicit key + table mapping for every entity
        sb.AppendLine("        protected override void OnModelCreating(ModelBuilder modelBuilder)");
        sb.AppendLine("        {");
        foreach (var table in schema.Tables)
        {
            var className  = SanitizeTypeName(table.Name);
            var pkCols     = table.Columns.Where(c => c.IsPrimaryKey).ToList();
            var entityRef  = $"modelBuilder.Entity<{className}>()";

            // Table name mapping
            if (string.IsNullOrEmpty(table.Schema))
                sb.AppendLine($"            {entityRef}.ToTable(\"{Esc(table.Name)}\");");
            else
                sb.AppendLine($"            {entityRef}.ToTable(\"{Esc(table.Name)}\", \"{Esc(table.Schema)}\");");

            // Key mapping
            if (pkCols.Count == 0)
                sb.AppendLine($"            {entityRef}.HasNoKey();");
            else if (pkCols.Count == 1)
            {
                var pkProp = SanitizeTypeName(pkCols[0].Name);
                sb.AppendLine($"            {entityRef}.HasKey(e => e.{pkProp});");
            }
            else
            {
                var props = string.Join(", ", pkCols.Select(c => $"e.{SanitizeTypeName(c.Name)}"));
                sb.AppendLine($"            {entityRef}.HasKey(e => new {{ {props} }});");
            }

            // Column name + type mappings
            foreach (var col in table.Columns)
            {
                var propName = SanitizeTypeName(col.Name);
                var dbTypeLower = col.DbType?.ToLowerInvariant() ?? "";
                var needsColumnName = propName != col.Name;
                var needsColumnType = dbTypeLower is "json" or "jsonb" && !col.IsPrimaryKey;

                if (needsColumnName || needsColumnType)
                {
                    var chain = $"{entityRef}.Property(e => e.{propName})";
                    if (needsColumnName) chain += $".HasColumnName(\"{Esc(col.Name)}\")";
                    if (needsColumnType) chain += $".HasColumnType(\"{Esc(dbTypeLower)}\")";
                    sb.AppendLine($"            {chain};");
                }
            }
        }
        sb.AppendLine("        }");
        sb.AppendLine();

        foreach (var table in schema.Tables)
        {
            var className = SanitizeTypeName(table.Name);
            var propName  = SanitizeTypeName(table.Name);
            sb.AppendLine($"        public DbSet<{className}> {propName} {{ get; set; }} = null!;");
        }

        sb.AppendLine("    }");
        sb.AppendLine("}");

        return sb.ToString();
    }

    // ── Dynamic compilation ───────────────────────────────────────────────────

    public static (Assembly compiled, MetadataReference metaRef) Compile(string source, IDbProvider provider)
    {
        var assemblyName = $"DynDb_{Guid.NewGuid():N}";

        var parseOptions = new CSharpParseOptions(LanguageVersion.Latest);
        var syntaxTree   = CSharpSyntaxTree.ParseText(source, parseOptions);

        // Collect all required references
        var refs = new List<MetadataReference>
        {
            MetadataReference.CreateFromFile(typeof(object).Assembly.Location),
            MetadataReference.CreateFromFile(typeof(Enumerable).Assembly.Location),
            MetadataReference.CreateFromFile(typeof(System.Collections.Generic.List<>).Assembly.Location),
            MetadataReference.CreateFromFile(Assembly.Load("System.Runtime").Location),
            MetadataReference.CreateFromFile(Assembly.Load("System.Collections").Location),
            MetadataReference.CreateFromFile(Assembly.Load("System.Data.Common").Location),
            MetadataReference.CreateFromFile(Assembly.Load("netstandard").Location),
            MetadataReference.CreateFromFile(typeof(Microsoft.EntityFrameworkCore.DbContext).Assembly.Location),
            MetadataReference.CreateFromFile(Assembly.Load("Microsoft.EntityFrameworkCore.Relational").Location),
            MetadataReference.CreateFromFile(Assembly.Load("System.Linq.Expressions").Location),
            MetadataReference.CreateFromFile(Assembly.Load("System.ComponentModel.Primitives").Location),
            MetadataReference.CreateFromFile(Assembly.Load("System.ComponentModel.Annotations").Location),
            MetadataReference.CreateFromFile(typeof(System.Text.Json.JsonDocument).Assembly.Location),
        };

        // Add all provider assemblies from RequiredAssemblies
        foreach (var p in DbProviders.ListAll())
            foreach (var provAsm in p.RequiredAssemblies)
            {
                var loc = provAsm.Location;
                if (!string.IsNullOrEmpty(loc) && File.Exists(loc))
                    refs.Add(MetadataReference.CreateFromFile(loc));
            }

        // Also scan AppDomain for currently-loaded EF Core / data provider assemblies
        var efPrefixes = new[] { "Microsoft.EntityFrameworkCore", "Microsoft.Data.Sqlite",
            "Microsoft.Data.SqlClient", "Npgsql", "StackExchange.Redis" };
        foreach (var domainAsm in AppDomain.CurrentDomain.GetAssemblies())
        {
            var asmName = domainAsm.GetName().Name ?? "";
            if (efPrefixes.Any(p => asmName.StartsWith(p, StringComparison.OrdinalIgnoreCase))
                && !string.IsNullOrEmpty(domainAsm.Location))
                refs.Add(MetadataReference.CreateFromFile(domainAsm.Location));
        }

        // Deduplicate by path
        var seen  = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var dedupd = refs.Where(r => r is PortableExecutableReference per && seen.Add(per.FilePath ?? "")).ToList();
        if (dedupd.Count == 0) dedupd = refs;

        var compilation = CSharpCompilation.Create(
            assemblyName,
            new[] { syntaxTree },
            dedupd,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

        using var ms = new MemoryStream();
        var result = compilation.Emit(ms);

        if (!result.Success)
        {
            var errors = string.Join("\n", result.Diagnostics
                .Where(d => d.Severity == DiagnosticSeverity.Error)
                .Select(d => d.ToString()));
            throw new Exception($"DB context compilation failed:\n{errors}");
        }

        ms.Position = 0;
        var bytes    = ms.ToArray();
        var compiled = Assembly.Load(bytes);
        var metaRef  = MetadataReference.CreateFromImage(bytes);
        return (compiled, metaRef);
    }
}
