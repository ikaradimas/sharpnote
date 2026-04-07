'use strict';

/**
 * Converts an API Editor definition to an OpenAPI 3.0.3 specification.
 */

const FIELD_TYPE_MAP = {
  'string':   { type: 'string' },
  'int':      { type: 'integer', format: 'int32' },
  'long':     { type: 'integer', format: 'int64' },
  'float':    { type: 'number', format: 'float' },
  'double':   { type: 'number', format: 'double' },
  'decimal':  { type: 'number', format: 'double' },
  'bool':     { type: 'boolean' },
  'boolean':  { type: 'boolean' },
  'date':     { type: 'string', format: 'date' },
  'datetime': { type: 'string', format: 'date-time' },
  'uuid':     { type: 'string', format: 'uuid' },
  'object':   { type: 'object' },
};

function fieldTypeToSchema(typeStr, modelNames) {
  if (!typeStr) return { type: 'string' };
  const trimmed = typeStr.trim();
  const lower = trimmed.toLowerCase();

  // Array: "string[]" or "List<User>" — match against original to preserve casing
  const arrayMatch = trimmed.match(/^(.+)\[\]$/) || trimmed.match(/^list<(.+)>$/i);
  if (arrayMatch) {
    return { type: 'array', items: fieldTypeToSchema(arrayMatch[1].trim(), modelNames) };
  }

  // Known primitive
  if (FIELD_TYPE_MAP[lower]) return { ...FIELD_TYPE_MAP[lower] };

  // Model reference
  if (modelNames.has(typeStr.trim())) {
    return { $ref: `#/components/schemas/${typeStr.trim()}` };
  }

  // Fallback
  return { type: 'string' };
}

function modelToSchema(model, modelNames) {
  const properties = {};
  const required = [];
  for (const field of model.fields || []) {
    if (!field.name) continue;
    const prop = fieldTypeToSchema(field.type, modelNames);
    if (field.description) prop.description = field.description;
    properties[field.name] = prop;
    if (field.required) required.push(field.name);
  }
  const schema = { type: 'object', properties };
  if (model.description) schema.description = model.description;
  if (required.length > 0) schema.required = required;
  return schema;
}

function schemaRefOrInline(schemaName, modelNames) {
  if (!schemaName) return null;
  if (modelNames.has(schemaName)) {
    return { $ref: `#/components/schemas/${schemaName}` };
  }
  // Try parsing as inline JSON schema
  try {
    return JSON.parse(schemaName);
  } catch {
    return { type: 'string' };
  }
}

function toOpenApiSpec(apiDef) {
  const modelNames = new Set((apiDef.models || []).map(m => m.name).filter(Boolean));

  const spec = {
    openapi: '3.0.3',
    info: {
      title: apiDef.title || 'Untitled API',
      version: apiDef.version || '1.0.0',
    },
    servers: [],
    tags: [],
    paths: {},
    components: { schemas: {} },
  };

  if (apiDef.description) spec.info.description = apiDef.description;
  if (apiDef.baseUrl) spec.servers.push({ url: apiDef.baseUrl });

  // Models → schemas
  for (const model of apiDef.models || []) {
    if (!model.name) continue;
    spec.components.schemas[model.name] = modelToSchema(model, modelNames);
  }

  // Controllers → tags + paths
  for (const ctrl of apiDef.controllers || []) {
    if (ctrl.name) {
      const tag = { name: ctrl.name };
      if (ctrl.description) tag.description = ctrl.description;
      spec.tags.push(tag);
    }

    for (const ep of ctrl.endpoints || []) {
      const fullPath = (ctrl.basePath || '') + (ep.path || '');
      if (!fullPath) continue;

      if (!spec.paths[fullPath]) spec.paths[fullPath] = {};

      const method = (ep.method || 'get').toLowerCase();
      const operation = {};

      if (ep.summary) operation.summary = ep.summary;
      if (ep.description) operation.description = ep.description;
      if (ctrl.name) operation.tags = [ctrl.name];
      if (ep.id) operation.operationId = ep.id;

      // Parameters (path, query, header)
      const params = [];
      for (const p of ep.parameters || []) {
        if (!p.name) continue;
        const param = {
          name: p.name,
          in: p.in || 'query',
          required: p.in === 'path' ? true : !!p.required,
          schema: fieldTypeToSchema(p.schema || 'string', modelNames),
        };
        if (p.description) param.description = p.description;
        params.push(param);
      }
      for (const h of ep.headers || []) {
        if (!h.name) continue;
        const param = {
          name: h.name,
          in: 'header',
          required: !!h.required,
          schema: fieldTypeToSchema(h.schema || 'string', modelNames),
        };
        if (h.description) param.description = h.description;
        params.push(param);
      }
      if (params.length > 0) operation.parameters = params;

      // Request body
      if (ep.requestBody && ep.requestBody.schema) {
        const contentType = ep.requestBody.contentType || 'application/json';
        const bodySchema = schemaRefOrInline(ep.requestBody.schema, modelNames);
        if (bodySchema) {
          operation.requestBody = {
            required: true,
            content: { [contentType]: { schema: bodySchema } },
          };
          if (ep.requestBody.description) operation.requestBody.description = ep.requestBody.description;
        }
      }

      // Responses
      const responses = {};
      for (const r of ep.responses || []) {
        const status = r.status || '200';
        const resp = { description: r.description || '' };
        if (r.schema) {
          const rSchema = schemaRefOrInline(r.schema, modelNames);
          if (rSchema) resp.content = { 'application/json': { schema: rSchema } };
        }
        responses[status] = resp;
      }
      if (Object.keys(responses).length === 0) {
        responses['200'] = { description: 'Successful response' };
      }
      operation.responses = responses;

      spec.paths[fullPath][method] = operation;
    }
  }

  // Clean up empty sections
  if (spec.tags.length === 0) delete spec.tags;
  if (spec.servers.length === 0) delete spec.servers;
  if (Object.keys(spec.components.schemas).length === 0) delete spec.components;

  return spec;
}

module.exports = { toOpenApiSpec, fieldTypeToSchema, modelToSchema };
