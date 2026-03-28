import { describe, it, expect } from 'vitest';
import { schemaToCSharpClass, schemaHasClass } from '../../src/components/panels/ApiPanel.jsx';

const SPEC_WITH_REFS = {
  openapi: '3.0.3',
  components: {
    schemas: {
      Address: {
        type: 'object',
        properties: {
          street: { type: 'string' },
          zip:    { type: 'string' },
        },
      },
    },
  },
};

describe('schemaHasClass', () => {
  it('returns true for object schema with properties', () => {
    expect(schemaHasClass({}, { type: 'object', properties: { x: { type: 'string' } } })).toBe(true);
  });

  it('returns true for array of objects', () => {
    expect(schemaHasClass({}, { type: 'array', items: { type: 'object', properties: { x: { type: 'string' } } } })).toBe(true);
  });

  it('returns false for scalar', () => {
    expect(schemaHasClass({}, { type: 'string' })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(schemaHasClass({}, null)).toBe(false);
    expect(schemaHasClass({}, undefined)).toBe(false);
  });

  it('resolves $ref before checking', () => {
    expect(schemaHasClass(SPEC_WITH_REFS, { $ref: '#/components/schemas/Address' })).toBe(true);
  });
});

describe('schemaToCSharpClass', () => {
  const flat = {
    type: 'object',
    properties: {
      id:        { type: 'integer' },
      full_name: { type: 'string' },
      active:    { type: 'boolean' },
      score:     { type: 'number' },
    },
  };

  it('generates a class with STJ attributes', () => {
    const code = schemaToCSharpClass({}, flat, 'User', 'stj');
    expect(code).toContain('public class User');
    expect(code).toContain('[JsonPropertyName("id")]');
    expect(code).toContain('public int Id { get; set; }');
    expect(code).toContain('[JsonPropertyName("full_name")]');
    expect(code).toContain('public string FullName { get; set; }');
    expect(code).toContain('public bool Active { get; set; }');
  });

  it('generates a class with Newtonsoft attributes', () => {
    const code = schemaToCSharpClass({}, flat, 'User', 'newtonsoft');
    expect(code).toContain('[JsonProperty("id")]');
    expect(code).toContain('public int Id { get; set; }');
  });

  it('maps integer int64 format to long', () => {
    const schema = { type: 'object', properties: { big: { type: 'integer', format: 'int64' } } };
    const code = schemaToCSharpClass({}, schema, 'M', 'stj');
    expect(code).toContain('public long Big { get; set; }');
  });

  it('maps string date-time to DateTime', () => {
    const schema = { type: 'object', properties: { created: { type: 'string', format: 'date-time' } } };
    const code = schemaToCSharpClass({}, schema, 'M', 'stj');
    expect(code).toContain('public DateTime Created { get; set; }');
  });

  it('maps string uuid to Guid', () => {
    const schema = { type: 'object', properties: { uid: { type: 'string', format: 'uuid' } } };
    const code = schemaToCSharpClass({}, schema, 'M', 'stj');
    expect(code).toContain('public Guid Uid { get; set; }');
  });

  it('maps array property to List<T>', () => {
    const schema = {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
    };
    const code = schemaToCSharpClass({}, schema, 'M', 'stj');
    expect(code).toContain('public List<string> Tags { get; set; }');
  });

  it('resolves $ref and uses the ref class name', () => {
    const schema = { $ref: '#/components/schemas/Address' };
    const code = schemaToCSharpClass(SPEC_WITH_REFS, schema, 'Ignored', 'stj');
    expect(code).toContain('public class Address');
    expect(code).toContain('[JsonPropertyName("street")]');
    expect(code).toContain('public string Street { get; set; }');
  });

  it('emits nested class for inline object property', () => {
    const schema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            city: { type: 'string' },
          },
        },
      },
    };
    const code = schemaToCSharpClass({}, schema, 'Person', 'stj');
    expect(code).toContain('public class Person');
    expect(code).toContain('public class PersonAddress');
    expect(code).toContain('public PersonAddress Address { get; set; }');
    expect(code).toContain('public string City { get; set; }');
  });

  it('does not duplicate classes referenced multiple times', () => {
    const spec = {
      components: {
        schemas: {
          Tag: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    };
    const schema = {
      type: 'object',
      properties: {
        primary: { $ref: '#/components/schemas/Tag' },
        fallback: { $ref: '#/components/schemas/Tag' },
      },
    };
    const code = schemaToCSharpClass(spec, schema, 'Item', 'stj');
    const classCount = (code.match(/public class Tag/g) || []).length;
    expect(classCount).toBe(1);
  });
});
