import { describe, it, expect } from 'vitest';
import { generateImportCode } from '../../src/data-import-templates.js';

describe('generateImportCode', () => {
  it('generates CSV code with Data.LoadCsv', () => {
    const code = generateImportCode('/tmp/test.csv', '.csv');
    expect(code).toContain('Data.LoadCsv');
    expect(code).toContain('/tmp/test.csv');
    expect(code).not.toContain('#r');
  });

  it('generates TSV code with tab delimiter', () => {
    const code = generateImportCode('/tmp/test.tsv', '.tsv');
    expect(code).toContain('Data.LoadCsv');
    expect(code).toContain("delimiter: '\\t'");
  });

  it('generates Excel code with ClosedXML nuget directive', () => {
    const code = generateImportCode('/tmp/report.xlsx', '.xlsx');
    expect(code).toContain('#r "nuget: ClosedXML"');
    expect(code).toContain('ClosedXML.Excel');
    expect(code).toContain('/tmp/report.xlsx');
  });

  it('generates Parquet code with Parquet.Net nuget directive', () => {
    const code = generateImportCode('/tmp/data.parquet', '.parquet');
    expect(code).toContain('#r "nuget: Parquet.Net"');
    expect(code).toContain('ParquetReader');
    expect(code).toContain('/tmp/data.parquet');
  });

  it('handles .pqt extension as parquet', () => {
    const code = generateImportCode('/tmp/data.pqt', '.pqt');
    expect(code).toContain('#r "nuget: Parquet.Net"');
  });

  it('escapes backslashes in Windows paths', () => {
    const code = generateImportCode('C:\\Users\\test\\data.csv', '.csv');
    expect(code).toContain('C:\\\\Users\\\\test\\\\data.csv');
  });

  it('returns comment for unsupported extension', () => {
    const code = generateImportCode('/tmp/data.xyz', '.xyz');
    expect(code).toContain('Unsupported format');
    expect(code).toContain('.xyz');
  });

  it('all generated code ends with "data" expression for auto-display', () => {
    for (const ext of ['.csv', '.tsv', '.xlsx', '.parquet']) {
      const code = generateImportCode('/tmp/test' + ext, ext);
      expect(code.trimEnd()).toMatch(/\ndata$/);
    }
  });
});
