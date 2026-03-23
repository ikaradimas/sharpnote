import { describe, it, expect } from 'vitest';
import {
  getBaseUrl,
  groupOperations,
  resolveRef,
  getSchemaType,
  getSwagger2BodyInfo,
} from '../../src/components/panels/ApiPanel.jsx';

// ── getBaseUrl ────────────────────────────────────────────────────────────────

describe('getBaseUrl', () => {
  it('uses first server URL for OAS3 specs', () => {
    const spec = { servers: [{ url: 'https://api.example.com/v1' }] };
    expect(getBaseUrl(spec)).toBe('https://api.example.com/v1');
  });

  it('returns empty string when OAS3 server URL is absent', () => {
    const spec = { servers: [{}] };
    expect(getBaseUrl(spec)).toBe('');
  });

  it('constructs URL from host+basePath for Swagger 2', () => {
    const spec = { host: 'api.old.example.com', basePath: '/v2', schemes: ['https'] };
    expect(getBaseUrl(spec)).toBe('https://api.old.example.com/v2');
  });

  it('defaults scheme to https when schemes is absent', () => {
    const spec = { host: 'api.example.com', basePath: '/api' };
    expect(getBaseUrl(spec)).toBe('https://api.example.com/api');
  });

  it('uses first scheme from schemes array', () => {
    const spec = { host: 'api.example.com', schemes: ['http', 'https'] };
    expect(getBaseUrl(spec)).toBe('http://api.example.com');
  });

  it('returns empty string when no servers or host', () => {
    expect(getBaseUrl({})).toBe('');
    expect(getBaseUrl({ paths: {} })).toBe('');
  });
});

// ── groupOperations ───────────────────────────────────────────────────────────

describe('groupOperations', () => {
  it('groups operations by first tag', () => {
    const spec = {
      paths: {
        '/pets': {
          get: { tags: ['pets'], summary: 'List' },
          post: { tags: ['pets'], summary: 'Create' },
        },
      },
    };
    const groups = groupOperations(spec);
    expect(Object.keys(groups)).toEqual(['pets']);
    expect(groups.pets).toHaveLength(2);
    expect(groups.pets[0]).toMatchObject({ method: 'get', path: '/pets' });
    expect(groups.pets[1]).toMatchObject({ method: 'post', path: '/pets' });
  });

  it('assigns tagless operations to "Default"', () => {
    const spec = {
      paths: {
        '/health': { get: { summary: 'Health check' } },
      },
    };
    const groups = groupOperations(spec);
    expect(groups['Default']).toHaveLength(1);
    expect(groups['Default'][0].path).toBe('/health');
  });

  it('only includes recognised HTTP methods', () => {
    const spec = {
      paths: {
        '/item': {
          get: { summary: 'Get' },
          parameters: [{ name: 'id', in: 'path' }], // path-level param, not an operation
        },
      },
    };
    const groups = groupOperations(spec);
    const allMethods = Object.values(groups).flat().map(e => e.method);
    expect(allMethods).not.toContain('parameters');
    expect(allMethods).toContain('get');
  });

  it('returns empty object for spec with no paths', () => {
    expect(groupOperations({})).toEqual({});
    expect(groupOperations({ paths: {} })).toEqual({});
  });

  it('splits operations across different tags into separate groups', () => {
    const spec = {
      paths: {
        '/a': { get: { tags: ['alpha'] } },
        '/b': { post: { tags: ['beta'] } },
      },
    };
    const groups = groupOperations(spec);
    expect(Object.keys(groups).sort()).toEqual(['alpha', 'beta']);
  });
});

// ── resolveRef ────────────────────────────────────────────────────────────────

describe('resolveRef', () => {
  const spec = {
    components: {
      schemas: {
        Pet: { type: 'object', properties: { name: { type: 'string' } } },
      },
    },
    definitions: {
      User: { type: 'object' },
    },
  };

  it('resolves a #/components/schemas ref', () => {
    const result = resolveRef(spec, '#/components/schemas/Pet');
    expect(result).toEqual(spec.components.schemas.Pet);
  });

  it('resolves a #/definitions ref (Swagger 2)', () => {
    const result = resolveRef(spec, '#/definitions/User');
    expect(result).toEqual(spec.definitions.User);
  });

  it('returns null for a missing ref', () => {
    expect(resolveRef(spec, '#/definitions/Missing')).toBeNull();
  });

  it('returns null for a non-local ref', () => {
    expect(resolveRef(spec, 'https://external.example.com/schema')).toBeNull();
  });

  it('returns null for null/undefined ref', () => {
    expect(resolveRef(spec, null)).toBeNull();
    expect(resolveRef(spec, undefined)).toBeNull();
  });
});

// ── getSchemaType ─────────────────────────────────────────────────────────────

describe('getSchemaType', () => {
  const spec = {
    definitions: {
      User: { type: 'object', properties: { id: { type: 'integer' } } },
    },
    components: {
      schemas: {
        Tag: { type: 'string' },
      },
    },
  };

  it('returns the primitive type', () => {
    expect(getSchemaType(spec, { type: 'string' })).toBe('string');
    expect(getSchemaType(spec, { type: 'integer' })).toBe('integer');
    expect(getSchemaType(spec, { type: 'boolean' })).toBe('boolean');
  });

  it('returns "object" when schema has properties but no type', () => {
    expect(getSchemaType(spec, { properties: { x: { type: 'string' } } })).toBe('object');
  });

  it('returns empty string for null/undefined schema', () => {
    expect(getSchemaType(spec, null)).toBe('');
    expect(getSchemaType(spec, undefined)).toBe('');
  });

  it('resolves $ref and returns resolved type', () => {
    expect(getSchemaType(spec, { $ref: '#/definitions/User' })).toBe('object');
    expect(getSchemaType(spec, { $ref: '#/components/schemas/Tag' })).toBe('string');
  });

  it('returns last segment of $ref for unresolvable refs', () => {
    expect(getSchemaType(spec, { $ref: '#/definitions/Missing' })).toBe('Missing');
  });

  it('returns array notation for array types', () => {
    expect(getSchemaType(spec, { type: 'array', items: { type: 'string' } })).toBe('string[]');
  });

  it('resolves $ref items in arrays', () => {
    expect(getSchemaType(spec, { type: 'array', items: { $ref: '#/definitions/User' } })).toBe('object[]');
  });
});

// ── getSwagger2BodyInfo ───────────────────────────────────────────────────────

describe('getSwagger2BodyInfo', () => {
  const spec = {
    consumes: ['application/json'],
    definitions: { User: { type: 'object' } },
  };

  it('returns null when no body parameter exists', () => {
    const op = { parameters: [{ name: 'id', in: 'path' }] };
    expect(getSwagger2BodyInfo(spec, op)).toBeNull();
  });

  it('returns null when parameters array is absent', () => {
    expect(getSwagger2BodyInfo(spec, {})).toBeNull();
  });

  it('returns body info for in:"body" parameter', () => {
    const op = {
      parameters: [{ name: 'body', in: 'body', required: true, schema: { $ref: '#/definitions/User' } }],
    };
    const result = getSwagger2BodyInfo(spec, op);
    expect(result).not.toBeNull();
    expect(result.required).toBe(true);
    expect(result.schema).toEqual({ $ref: '#/definitions/User' });
  });

  it('inherits consumes from spec when not on operation', () => {
    const op = {
      parameters: [{ name: 'body', in: 'body', schema: { type: 'object' } }],
    };
    const result = getSwagger2BodyInfo(spec, op);
    expect(result.consumes).toEqual(['application/json']);
  });

  it('prefers operation-level consumes over spec-level', () => {
    const op = {
      consumes: ['application/xml'],
      parameters: [{ name: 'body', in: 'body', schema: { type: 'object' } }],
    };
    const result = getSwagger2BodyInfo(spec, op);
    expect(result.consumes).toEqual(['application/xml']);
  });

  it('required defaults to false when not set', () => {
    const op = {
      parameters: [{ name: 'body', in: 'body', schema: { type: 'object' } }],
    };
    const result = getSwagger2BodyInfo(spec, op);
    expect(result.required).toBe(false);
  });

  it('returns null schema when body param has no schema', () => {
    const op = {
      parameters: [{ name: 'body', in: 'body' }],
    };
    const result = getSwagger2BodyInfo(spec, op);
    expect(result.schema).toBeNull();
  });
});
