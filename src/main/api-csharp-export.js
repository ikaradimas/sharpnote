'use strict';

/**
 * Generates a .NET 8 Web API project from an API Editor definition.
 * Returns a map of { relativePath: fileContent } for all project files.
 */

const CSHARP_TYPE_MAP = {
  'string': 'string', 'int': 'int', 'long': 'long',
  'float': 'float', 'double': 'double', 'decimal': 'decimal',
  'bool': 'bool', 'boolean': 'bool',
  'date': 'DateOnly', 'datetime': 'DateTime', 'uuid': 'Guid', 'object': 'object',
};

function toCSharpType(typeStr, nullable = false) {
  if (!typeStr) return 'string';
  const trimmed = typeStr.trim();
  const listMatch = trimmed.match(/^List<(.+)>$/i);
  if (listMatch) return `List<${toCSharpType(listMatch[1])}>`;
  const mapped = CSHARP_TYPE_MAP[trimmed.toLowerCase()];
  const result = mapped || trimmed; // model name pass-through
  return nullable ? `${result}?` : result;
}

function pascalCase(str) {
  return str.replace(/(?:^|[_\s-])([a-z])/g, (_, c) => c.toUpperCase())
            .replace(/[^a-zA-Z0-9]/g, '');
}

function camelCase(str) {
  const p = pascalCase(str);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

// ── Model generation ─────────────────────────────────────────────────────────

function generateModel(model) {
  const lines = [];
  if (model.description) lines.push(`/// <summary>${model.description}</summary>`);
  lines.push(`public class ${pascalCase(model.name)}`);
  lines.push('{');
  for (const field of (model.fields || [])) {
    const type = toCSharpType(field.type, !field.required);
    const propName = pascalCase(field.name);
    if (field.description) lines.push(`    /// <summary>${field.description}</summary>`);
    lines.push(`    public ${type} ${propName} { get; set; }`);
  }
  lines.push('}');
  return lines.join('\n');
}

// ── Controller generation ────────────────────────────────────────────────────

function httpMethodAttr(method) {
  const m = (method || 'get').toLowerCase();
  return { get: 'HttpGet', post: 'HttpPost', put: 'HttpPut', delete: 'HttpDelete', patch: 'HttpPatch' }[m] || 'HttpGet';
}

function generateController(controller, models) {
  const name = pascalCase(controller.name || 'Default');
  const basePath = (controller.basePath || '/api').replace(/^\//, '');
  const lines = [];

  if (controller.description) lines.push(`/// <summary>${controller.description}</summary>`);
  lines.push(`[ApiController]`);
  lines.push(`[Route("${basePath}")]`);
  lines.push(`public class ${name}Controller : ControllerBase`);
  lines.push('{');

  for (const ep of (controller.endpoints || [])) {
    const method = httpMethodAttr(ep.method);
    const path = (ep.path || '').replace(/^\//, '');
    const attrPath = path ? `("${path}")` : '';
    const actionName = buildActionName(ep);

    lines.push('');
    if (ep.summary) lines.push(`    /// <summary>${ep.summary}</summary>`);

    lines.push(`    [${method}${attrPath}]`);

    // Build parameters
    const params = [];
    for (const p of (ep.parameters || [])) {
      const type = toCSharpType(p.schema || 'string');
      const attr = p.in === 'query' ? '[FromQuery] ' : '';
      params.push(`${attr}${type} ${camelCase(p.name)}`);
    }
    if (ep.requestBody?.schema) {
      const bodyType = toCSharpType(ep.requestBody.schema);
      params.push(`[FromBody] ${bodyType} body`);
    }

    // Determine return type from first success response
    const successResp = (ep.responses || []).find(r => r.status?.startsWith('2'));
    const returnType = successResp?.schema ? toCSharpType(successResp.schema) : null;
    const returnTypeStr = returnType ? `ActionResult<${returnType}>` : 'IActionResult';

    lines.push(`    public async Task<${returnTypeStr}> ${actionName}(${params.join(', ')})`);
    lines.push('    {');
    lines.push('        // TODO: implement');
    lines.push(`        throw new NotImplementedException();`);
    lines.push('    }');
  }

  lines.push('}');
  return lines.join('\n');
}

function buildActionName(ep) {
  const method = (ep.method || 'get').toLowerCase();
  const path = ep.path || '';
  const prefix = { get: 'Get', post: 'Create', put: 'Update', delete: 'Delete', patch: 'Patch' }[method] || 'Handle';
  // Extract meaningful segment from path
  const segments = path.split('/').filter(s => s && !s.startsWith('{'));
  if (segments.length > 0) return prefix + pascalCase(segments[segments.length - 1]);
  // If path only has parameter like /{id}, use summary or generic name
  if (ep.summary) {
    const words = ep.summary.split(/\s+/).slice(0, 3).map(w => pascalCase(w)).join('');
    if (words) return words;
  }
  const hasParam = path.includes('{');
  if (method === 'get' && hasParam) return prefix + 'ById';
  if (method === 'get') return prefix + 'All';
  return prefix;
}

// ── Project file generation ──────────────────────────────────────────────────

function generateCsproj(title) {
  return `<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <RootNamespace>${pascalCase(title || 'Api')}</RootNamespace>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>`;
}

function generateProgram() {
  return `var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.MapControllers();
app.Run();`;
}

// ── Main export function ─────────────────────────────────────────────────────

function generateCSharpProject(apiDef) {
  const files = {};
  const ns = pascalCase(apiDef.title || 'Api');

  // .csproj
  files[`${ns}.csproj`] = generateCsproj(apiDef.title);

  // Program.cs
  files['Program.cs'] = generateProgram();

  // Models
  const modelNames = (apiDef.models || []).map(m => pascalCase(m.name));
  for (const model of (apiDef.models || [])) {
    const code = `namespace ${ns}.Models;\n\n${generateModel(model)}\n`;
    files[`Models/${pascalCase(model.name)}.cs`] = code;
  }

  // Controllers
  for (const ctrl of (apiDef.controllers || [])) {
    const name = pascalCase(ctrl.name || 'Default');
    const usings = [`using Microsoft.AspNetCore.Mvc;`];
    if (modelNames.length > 0) usings.push(`using ${ns}.Models;`);
    const code = `${usings.join('\n')}\n\nnamespace ${ns}.Controllers;\n\n${generateController(ctrl, apiDef.models)}\n`;
    files[`Controllers/${name}Controller.cs`] = code;
  }

  return files;
}

module.exports = { generateCSharpProject };
