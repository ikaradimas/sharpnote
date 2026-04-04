/**
 * Generates C# code for importing a data file based on its extension.
 * CSV uses the built-in Data.LoadCsv() kernel global.
 * Excel and Parquet generate self-contained cells with #r NuGet directives.
 */
export function generateImportCode(filePath, ext) {
  const escaped = filePath.replace(/\\/g, '\\\\');
  switch (ext) {
    case '.csv':  return csvTemplate(escaped);
    case '.tsv':  return tsvTemplate(escaped);
    case '.xlsx': return excelTemplate(escaped);
    case '.parquet':
    case '.pqt':  return parquetTemplate(escaped);
    default:      return `// Unsupported format: ${ext}`;
  }
}

function csvTemplate(path) {
  return `var data = Data.LoadCsv(@"${path}");
data`;
}

function tsvTemplate(path) {
  return `var data = Data.LoadCsv(@"${path}", delimiter: '\\t');
data`;
}

function excelTemplate(path) {
  return `#r "nuget: ClosedXML"
using ClosedXML.Excel;

var wb = new XLWorkbook(@"${path}");
var ws = wb.Worksheet(1);
var headerRow = ws.FirstRowUsed();
var headers = headerRow.CellsUsed().Select(c => c.GetString()).ToList();

var data = ws.RowsUsed().Skip(1).Select(row => {
    var dict = new Dictionary<string, object>();
    for (int i = 0; i < headers.Count; i++)
        dict[headers[i]] = row.Cell(i + 1).Value;
    return dict;
}).ToList();
data`;
}

function parquetTemplate(path) {
  return `#r "nuget: Parquet.Net"
using Parquet;
using Parquet.Schema;

using var stream = File.OpenRead(@"${path}");
using var reader = await ParquetReader.CreateAsync(stream);
var schema = reader.Schema;

var data = new List<Dictionary<string, object>>();
for (int g = 0; g < reader.RowGroupCount; g++) {
    using var groupReader = reader.OpenRowGroupReader(g);
    var columns = schema.GetDataFields();
    var arrays = columns.Select(c => (c.Name, Data: (Array)groupReader.ReadColumn(c).Data)).ToList();
    int rowCount = arrays[0].Data.Length;
    for (int r = 0; r < rowCount; r++) {
        var dict = new Dictionary<string, object>();
        foreach (var (name, arr) in arrays)
            dict[name] = arr.GetValue(r);
        data.Add(dict);
    }
}
data`;
}
