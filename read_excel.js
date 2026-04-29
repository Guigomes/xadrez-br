const xlsx = require('xlsx');

const filePath = 'C:\\Users\\guigo\\Downloads\\chessResultsList (1).xlsx';

const workbook = xlsx.readFile(filePath);
const worksheet = workbook.Sheets['Sheet1'];

const allRows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

// Row 15 contains the headers
const headerRow = 15;
const headers = allRows[headerRow];

console.log('=== EXCEL FILE STRUCTURE ===\n');
console.log('Sheet name: Sheet1');
console.log('Total rows: ' + allRows.length);
console.log('Actual data starts at row: ' + (headerRow + 1) + ' (after metadata rows)\n');

console.log('COLUMN HEADERS (Row ' + (headerRow + 1) + '):');
console.log('Column count: ' + headers.length + '\n');

headers.forEach((header, idx) => {
  const colNum = idx + 1;
  const colLetter = String.fromCharCode(65 + (idx % 26));
  console.log('  ' + colLetter + idx + '. "' + header + '"');
});

console.log('\n\nFIRST 10 DATA ROWS (Rows ' + (headerRow + 2) + ' - ' + (headerRow + 11) + '):');
console.log('(Header row is at position ' + (headerRow + 1) + ', data starts at ' + (headerRow + 2) + ')\n');

for (let i = headerRow + 1; i < Math.min(headerRow + 11, allRows.length); i++) {
  const row = allRows[i];
  const cells = [];
  for (let j = 0; j < headers.length; j++) {
    const v = row[j];
    if (v === null || v === undefined || v === '') {
      cells.push('null');
    } else if (typeof v === 'string') {
      cells.push('"' + v + '"');
    } else if (typeof v === 'number') {
      cells.push(v.toString());
    } else {
      cells.push(JSON.stringify(v));
    }
  }
  console.log('Row ' + (i + 1) + ': [' + cells.join(', ') + ']');
}

console.log('\n\nDATA TYPES AND SAMPLE VALUES:');
headers.forEach((header, idx) => {
  // Check types from multiple data rows
  const values = [];
  for (let i = headerRow + 1; i < Math.min(headerRow + 6, allRows.length); i++) {
    const v = allRows[i][idx];
    if (v !== null && v !== undefined && v !== '') {
      values.push(v);
    }
  }
  
  let typeInfo = 'mixed/empty';
  if (values.length > 0) {
    const types = new Set(values.map(v => typeof v));
    if (types.size === 1) {
      typeInfo = Array.from(types)[0];
    } else {
      typeInfo = 'mixed (' + Array.from(types).join(', ') + ')';
    }
  }
  
  console.log('  ' + header + ': ' + typeInfo);
  if (values.length > 0) {
    console.log('    Sample: ' + JSON.stringify(values[0]));
  }
});
