function ascii(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '');
}

function pdfText(value: string): string {
  return ascii(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

export function buildCertificatePdf(input: {
  playerName: string;
  tournamentName: string;
  dateLabel: string;
  rank: number | null;
  points: number;
  category?: string | null;
  validationUrl: string;
}): Buffer {
  const detail = [
    input.rank ? `${input.rank}o lugar` : null,
    `${input.points} ponto${input.points === 1 ? '' : 's'}`,
    input.category || null,
  ].filter(Boolean).join('  |  ');
  const content = [
    '0.10 0.28 0.20 rg 0 0 842 595 re f',
    '0.96 0.91 0.70 rg 18 18 806 559 re S',
    '1 1 1 rg BT /F1 20 Tf 265 500 Td (TORNEIOS XADREZ BR) Tj ET',
    '0.96 0.91 0.70 rg BT /F1 38 Tf 250 425 Td (CERTIFICADO) Tj ET',
    '1 1 1 rg BT /F1 16 Tf 240 365 Td (Certificamos a participacao de) Tj ET',
    `BT /F1 30 Tf 90 310 Td (${pdfText(input.playerName)}) Tj ET`,
    `BT /F1 17 Tf 90 260 Td (no torneio ${pdfText(input.tournamentName)}) Tj ET`,
    `0.96 0.91 0.70 rg BT /F1 16 Tf 90 215 Td (${pdfText(detail)}) Tj ET`,
    `0.80 0.83 0.82 rg BT /F1 12 Tf 90 145 Td (${pdfText(input.dateLabel)}) Tj ET`,
    `BT /F1 9 Tf 90 75 Td (Validacao: ${pdfText(input.validationUrl)}) Tj ET`,
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'ascii');
}
