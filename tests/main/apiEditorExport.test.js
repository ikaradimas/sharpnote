import { describe, it, expect, beforeAll } from 'vitest';

let toOpenApiSpec, fieldTypeToSchema, modelToSchema;

beforeAll(async () => {
  const mod = await import('../../src/main/api-editor-export.js');
  toOpenApiSpec = mod.toOpenApiSpec;
  fieldTypeToSchema = mod.fieldTypeToSchema;
  modelToSchema = mod.modelToSchema;
});

// ── fieldTypeToSchema ────────────────────────────────────────────────────────

describe('fieldTypeToSchema', () => {
  const models = new Set(['User', 'Order']);

  it('maps string primitive', () => {
    expect(fieldTypeToSchema('string', models)).toEqual({ type: 'string' });
  });

  it('maps int to integer/int32', () => {
    expect(fieldTypeToSchema('int', models)).toEqual({ type: 'integer', format: 'int32' });
  });

  it('maps long to integer/int64', () => {
    expect(fieldTypeToSchema('long', models)).toEqual({ type: 'integer', format: 'int64' });
  });

  it('maps float to number/float', () => {
    expect(fieldTypeToSchema('float', models)).toEqual({ type: 'number', format: 'float' });
  });

  it('maps double to number/double', () => {
    expect(fieldTypeToSchema('double', models)).toEqual({ type: 'number', format: 'double' });
  });

  it('maps bool to boolean', () => {
    expect(fieldTypeToSchema('bool', models)).toEqual({ type: 'boolean' });
  });

  it('maps boolean to boolean', () => {
    expect(fieldTypeToSchema('boolean', models)).toEqual({ type: 'boolean' });
  });

  it('maps date to string/date', () => {
    expect(fieldTypeToSchema('date', models)).toEqual({ type: 'string', format: 'date' });
  });

  it('maps datetime to string/date-time', () => {
    expect(fieldTypeToSchema('datetime', models)).toEqual({ type: 'string', format: 'date-time' });
  });

  it('maps uuid to string/uuid', () => {
    expect(fieldTypeToSchema('uuid', models)).toEqual({ type: 'string', format: 'uuid' });
  });

  it('maps object to { type: object }', () => {
    expect(fieldTypeToSchema('object', models)).toEqual({ type: 'object' });
  });

  it('defaults to string for null/undefined', () => {
    expect(fieldTypeToSchema(null, models)).toEqual({ type: 'string' });
    expect(fieldTypeToSchema(undefined, models)).toEqual({ type: 'string' });
  });

  it('defaults to string for unknown type', () => {
    expect(fieldTypeToSchema('foobar', models)).toEqual({ type: 'string' });
  });

  it('handles array bracket syntax (string[])', () => {
    expect(fieldTypeToSchema('string[]', models)).toEqual({
      type: 'array', items: { type: 'string' },
    });
  });

  it('handles array bracket syntax with model (user[] lowercased by parser)', () => {
    // Note: the function lowercases before regex matching, so inner type
    // becomes lowercase — model refs only match if the model name is also lowercase
    const lcModels = new Set(['user']);
    expect(fieldTypeToSchema('user[]', lcModels)).toEqual({
      type: 'array', items: { $ref: '#/components/schemas/user' },
    });
  });

  it('handles List<T> syntax', () => {
    expect(fieldTypeToSchema('List<int>', models)).toEqual({
      type: 'array', items: { type: 'integer', format: 'int32' },
    });
  });

  it('handles List<Model> with model reference (lowercased inner type)', () => {
    // Inner type is lowercased by the parser, so model name must match lowercase
    const lcModels = new Set(['user']);
    expect(fieldTypeToSchema('List<user>', lcModels)).toEqual({
      type: 'array', items: { $ref: '#/components/schemas/user' },
    });
  });

  it('generates $ref for known model names', () => {
    expect(fieldTypeToSchema('User', models)).toEqual({ $ref: '#/components/schemas/User' });
    expect(fieldTypeToSchema('Order', models)).toEqual({ $ref: '#/components/schemas/Order' });
  });

  it('is case-insensitive for primitives', () => {
    expect(fieldTypeToSchema('STRING', models)).toEqual({ type: 'string' });
    expect(fieldTypeToSchema('Bool', models)).toEqual({ type: 'boolean' });
  });
});

// ── modelToSchema ────────────────────────────────────────────────────────────

describe('modelToSchema', () => {
  const models = new Set(['Address']);

  it('returns an object schema with properties', () => {
    const model = {
      name: 'User',
      fields: [
        { name: 'id', type: 'int' },
        { name: 'name', type: 'string' },
      ],
    };
    const schema = modelToSchema(model, models);
    expect(schema.type).toBe('object');
    expect(schema.properties.id).toEqual({ type: 'integer', format: 'int32' });
    expect(schema.properties.name).toEqual({ type: 'string' });
  });

  it('includes required array for required fields', () => {
    const model = {
      name: 'User',
      fields: [
        { name: 'id', type: 'int', required: true },
        { name: 'email', type: 'string', required: true },
        { name: 'bio', type: 'string' },
      ],
    };
    const schema = modelToSchema(model, models);
    expect(schema.required).toEqual(['id', 'email']);
  });

  it('omits required array when no fields are required', () => {
    const model = { name: 'Tag', fields: [{ name: 'label', type: 'string' }] };
    const schema = modelToSchema(model, models);
    expect(schema.required).toBeUndefined();
  });

  it('includes field descriptions', () => {
    const model = {
      name: 'Item',
      fields: [{ name: 'sku', type: 'string', description: 'Stock Keeping Unit' }],
    };
    const schema = modelToSchema(model, models);
    expect(schema.properties.sku.description).toBe('Stock Keeping Unit');
  });

  it('includes model description', () => {
    const model = { name: 'Item', description: 'A product item', fields: [] };
    const schema = modelToSchema(model, models);
    expect(schema.description).toBe('A product item');
  });

  it('skips fields without a name', () => {
    const model = {
      name: 'Partial',
      fields: [{ name: '', type: 'string' }, { name: 'valid', type: 'int' }],
    };
    const schema = modelToSchema(model, models);
    expect(Object.keys(schema.properties)).toEqual(['valid']);
  });
});

// ── toOpenApiSpec ────────────────────────────────────────────────────────────

describe('toOpenApiSpec', () => {
  it('returns a valid OpenAPI 3.0.3 skeleton for an empty definition', () => {
    const spec = toOpenApiSpec({});
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toBe('Untitled API');
    expect(spec.info.version).toBe('1.0.0');
    expect(spec.paths).toEqual({});
    // Empty sections are cleaned up
    expect(spec.tags).toBeUndefined();
    expect(spec.servers).toBeUndefined();
    expect(spec.components).toBeUndefined();
  });

  it('maps title, description, and version to info block', () => {
    const spec = toOpenApiSpec({
      title: 'My API',
      description: 'A test API',
      version: '2.0.0',
    });
    expect(spec.info.title).toBe('My API');
    expect(spec.info.description).toBe('A test API');
    expect(spec.info.version).toBe('2.0.0');
  });

  it('maps baseUrl to servers array', () => {
    const spec = toOpenApiSpec({ baseUrl: 'https://api.example.com' });
    expect(spec.servers).toEqual([{ url: 'https://api.example.com' }]);
  });

  it('omits servers when baseUrl is empty', () => {
    const spec = toOpenApiSpec({ baseUrl: '' });
    expect(spec.servers).toBeUndefined();
  });

  it('generates components.schemas from models', () => {
    const spec = toOpenApiSpec({
      models: [
        {
          name: 'User',
          description: 'A user record',
          fields: [
            { name: 'id', type: 'int', required: true },
            { name: 'name', type: 'string', required: true, description: 'Display name' },
            { name: 'email', type: 'string' },
          ],
        },
      ],
    });
    const userSchema = spec.components.schemas.User;
    expect(userSchema.type).toBe('object');
    expect(userSchema.description).toBe('A user record');
    expect(userSchema.properties.id).toEqual({ type: 'integer', format: 'int32' });
    expect(userSchema.properties.name.description).toBe('Display name');
    expect(userSchema.required).toEqual(['id', 'name']);
  });

  it('generates tags and paths from controllers', () => {
    const spec = toOpenApiSpec({
      controllers: [{
        name: 'Users',
        description: 'User management',
        basePath: '/api',
        endpoints: [
          { method: 'get', path: '/users', summary: 'List users' },
          { method: 'post', path: '/users', summary: 'Create user' },
        ],
      }],
    });
    expect(spec.tags).toEqual([{ name: 'Users', description: 'User management' }]);
    expect(spec.paths['/api/users'].get.summary).toBe('List users');
    expect(spec.paths['/api/users'].get.tags).toEqual(['Users']);
    expect(spec.paths['/api/users'].post.summary).toBe('Create user');
  });

  it('generates parameter objects for path, query, and header params', () => {
    const spec = toOpenApiSpec({
      controllers: [{
        name: 'Items',
        basePath: '',
        endpoints: [{
          method: 'get',
          path: '/items/{id}',
          parameters: [
            { name: 'id', in: 'path', schema: 'int', description: 'Item ID' },
            { name: 'fields', in: 'query', schema: 'string', required: false },
          ],
          headers: [
            { name: 'X-Tenant', schema: 'string', required: true, description: 'Tenant header' },
          ],
        }],
      }],
    });
    const params = spec.paths['/items/{id}'].get.parameters;
    expect(params).toHaveLength(3);

    const pathParam = params.find(p => p.name === 'id');
    expect(pathParam.in).toBe('path');
    expect(pathParam.required).toBe(true);
    expect(pathParam.schema).toEqual({ type: 'integer', format: 'int32' });
    expect(pathParam.description).toBe('Item ID');

    const queryParam = params.find(p => p.name === 'fields');
    expect(queryParam.in).toBe('query');
    expect(queryParam.required).toBe(false);

    const headerParam = params.find(p => p.name === 'X-Tenant');
    expect(headerParam.in).toBe('header');
    expect(headerParam.required).toBe(true);
    expect(headerParam.description).toBe('Tenant header');
  });

  it('generates $ref requestBody when referencing a model', () => {
    const spec = toOpenApiSpec({
      models: [{ name: 'CreateUser', fields: [{ name: 'name', type: 'string' }] }],
      controllers: [{
        name: 'Users',
        basePath: '',
        endpoints: [{
          method: 'post',
          path: '/users',
          requestBody: { schema: 'CreateUser', description: 'The user to create' },
        }],
      }],
    });
    const body = spec.paths['/users'].post.requestBody;
    expect(body.required).toBe(true);
    expect(body.description).toBe('The user to create');
    expect(body.content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/CreateUser',
    });
  });

  it('generates response objects with schemas', () => {
    const spec = toOpenApiSpec({
      models: [{ name: 'User', fields: [{ name: 'id', type: 'int' }] }],
      controllers: [{
        name: 'Users',
        basePath: '',
        endpoints: [{
          method: 'get',
          path: '/users',
          responses: [
            { status: '200', description: 'OK', schema: 'User' },
            { status: '404', description: 'Not found' },
          ],
        }],
      }],
    });
    const responses = spec.paths['/users'].get.responses;
    expect(responses['200'].description).toBe('OK');
    expect(responses['200'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/User',
    });
    expect(responses['404'].description).toBe('Not found');
    expect(responses['404'].content).toBeUndefined();
  });

  it('adds default 200 response when none are specified', () => {
    const spec = toOpenApiSpec({
      controllers: [{
        name: 'Health',
        basePath: '',
        endpoints: [{ method: 'get', path: '/health' }],
      }],
    });
    expect(spec.paths['/health'].get.responses['200'].description).toBe('Successful response');
  });

  it('skips models without a name', () => {
    const spec = toOpenApiSpec({
      models: [{ name: '', fields: [{ name: 'x', type: 'int' }] }],
    });
    expect(spec.components).toBeUndefined();
  });
});
