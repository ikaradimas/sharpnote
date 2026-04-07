import { describe, it, expect } from 'vitest';
import { generateExecutableProject, slugify, generateProgramCs, generateCsproj, generateConsoleStubsCs } from '../../src/main/export-exe.js';

describe('slugify', () => {
  it('converts spaces to hyphens', () => {
    expect(slugify('My Notebook')).toBe('My-Notebook');
  });
  it('strips special characters', () => {
    expect(slugify('test<>file')).toBe('testfile');
  });
  it('returns fallback for empty input', () => {
    expect(slugify('')).toBe('notebook-export');
  });
});

describe('generateProgramCs', () => {
  it('includes using statements', () => {
    const result = generateProgramCs([], [], 'Test');
    expect(result).toContain('using System;');
    expect(result).toContain('using System.Linq;');
    expect(result).toContain('using System.Net.Http;');
  });

  it('includes notebook title in header', () => {
    const result = generateProgramCs([], [], 'My Report');
    expect(result).toContain('My Report');
  });

  it('renders config as dictionary', () => {
    const config = [{ key: 'Env', value: 'prod' }, { key: 'Port', value: '8080' }];
    const result = generateProgramCs([], config, 'Test');
    expect(result).toContain('var Config = new Dictionary<string, string>');
    expect(result).toContain('["Env"] = "prod"');
    expect(result).toContain('["Port"] = "8080"');
  });

  it('skips config block when empty', () => {
    const result = generateProgramCs([], [], 'Test');
    expect(result).not.toContain('Dictionary<string, string>');
  });

  it('includes cell code with separators', () => {
    const cells = [
      { name: 'Load Data', content: 'var x = 1;' },
      { name: null, content: 'var y = 2;' },
    ];
    const result = generateProgramCs(cells, [], 'Test');
    expect(result).toContain('// ── Load Data');
    expect(result).toContain('var x = 1;');
    expect(result).toContain('// ── Cell 2');
    expect(result).toContain('var y = 2;');
  });

  it('strips #r "nuget:" directives', () => {
    const cells = [{ content: '#r "nuget: Newtonsoft.Json, 13.0.3"\nvar x = 1;' }];
    const result = generateProgramCs(cells, [], 'Test');
    expect(result).not.toContain('#r "nuget:');
    expect(result).toContain('var x = 1;');
  });

  it('escapes quotes in config values', () => {
    const config = [{ key: 'Query', value: 'SELECT "name"' }];
    const result = generateProgramCs([], config, 'Test');
    expect(result).toContain('SELECT \\"name\\"');
  });

  it('wraps trailing expression without semicolon in Console.WriteLine', () => {
    const cells = [{ content: 'var x = 42;\nx' }];
    const result = generateProgramCs(cells, [], 'Test');
    expect(result).toContain('Console.WriteLine(x);');
    expect(result).toContain('var x = 42;');
  });

  it('wraps bare DateTime.Now expression', () => {
    const cells = [{ content: 'DateTime.Now' }];
    const result = generateProgramCs(cells, [], 'Test');
    expect(result).toContain('Console.WriteLine(DateTime.Now);');
  });

  it('does not wrap lines ending with semicolon', () => {
    const cells = [{ content: 'Console.WriteLine("hi");' }];
    const result = generateProgramCs(cells, [], 'Test');
    expect(result).toContain('Console.WriteLine("hi");');
    expect(result).not.toContain('Console.WriteLine(Console.WriteLine');
  });

  it('does not wrap lines ending with braces', () => {
    const cells = [{ content: 'if (true) {\n  var x = 1;\n}' }];
    const result = generateProgramCs(cells, [], 'Test');
    expect(result).not.toContain('Console.WriteLine(})');
  });

  it('skips trailing comments to find expression', () => {
    const cells = [{ content: 'var x = 1;\nx\n// end' }];
    const result = generateProgramCs(cells, [], 'Test');
    expect(result).toContain('Console.WriteLine(x);');
  });
});

describe('generateCsproj', () => {
  it('produces valid XML with project name', () => {
    const result = generateCsproj('my-app', []);
    expect(result).toContain('<Project Sdk="Microsoft.NET.Sdk">');
    expect(result).toContain('<OutputType>Exe</OutputType>');
    expect(result).toContain('<TargetFramework>net10.0</TargetFramework>');
  });

  it('includes NuGet package references', () => {
    const packages = [
      { id: 'Newtonsoft.Json', version: '13.0.3' },
      { id: 'Dapper', version: '2.1.0' },
    ];
    const result = generateCsproj('test', packages);
    expect(result).toContain('<PackageReference Include="Newtonsoft.Json" Version="13.0.3"');
    expect(result).toContain('<PackageReference Include="Dapper" Version="2.1.0"');
  });

  it('handles packages without version', () => {
    const packages = [{ id: 'SomeLib', version: null }];
    const result = generateCsproj('test', packages);
    expect(result).toContain('<PackageReference Include="SomeLib" />');
    expect(result).not.toContain('Version=');
  });

  it('skips ItemGroup when no packages', () => {
    const result = generateCsproj('test', []);
    expect(result).not.toContain('<ItemGroup>');
  });
});

describe('generateConsoleStubsCs', () => {
  it('contains Display class', () => {
    const result = generateConsoleStubsCs();
    expect(result).toContain('public static class Display');
    expect(result).toContain('public static void Html(');
    expect(result).toContain('public static void Table(');
    expect(result).toContain('public static void Plot(');
  });

  it('contains extension methods', () => {
    const result = generateConsoleStubsCs();
    expect(result).toContain('public static class DisplayExtensions');
    expect(result).toContain('public static T Display<T>');
    expect(result).toContain('public static T Log<T>');
    expect(result).toContain('DisplayTable<T>');
  });
});

describe('generateExecutableProject', () => {
  it('returns three files with correct names', () => {
    const result = generateExecutableProject({
      cells: [{ content: 'Console.WriteLine("hi");' }],
      packages: [],
      config: [],
      title: 'My App',
    });
    expect(Object.keys(result)).toContain('Program.cs');
    expect(Object.keys(result)).toContain('ConsoleStubs.cs');
    expect(Object.keys(result)).toContain('My-App.csproj');
  });

  it('slugifies project name for .csproj', () => {
    const result = generateExecutableProject({
      cells: [],
      packages: [],
      config: [],
      title: 'Report Q4 2025!',
    });
    expect(Object.keys(result)).toContain('Report-Q4-2025.csproj');
  });

  it('end-to-end: cells + packages + config all present', () => {
    const result = generateExecutableProject({
      cells: [
        { name: 'Setup', content: '#r "nuget: Foo, 1.0"\nvar x = 42;' },
        { content: 'Console.WriteLine(x);' },
      ],
      packages: [{ id: 'Foo', version: '1.0' }],
      config: [{ key: 'Mode', value: 'fast' }],
      title: 'Test',
    });
    // Program.cs
    expect(result['Program.cs']).toContain('var x = 42;');
    expect(result['Program.cs']).not.toContain('#r "nuget:');
    expect(result['Program.cs']).toContain('["Mode"] = "fast"');
    // .csproj
    expect(result['Test.csproj']).toContain('Foo');
    // Stubs
    expect(result['ConsoleStubs.cs']).toContain('Display');
  });
});
