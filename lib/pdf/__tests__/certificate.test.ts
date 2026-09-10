import { describe, expect, it } from 'vitest';
import { buildCertificatePdf } from '../certificate';

describe('buildCertificatePdf', () => {
  it('creates a valid single-page PDF with normalized certificate data', () => {
    const pdf = buildCertificatePdf({
      playerName: 'João da Silva',
      tournamentName: 'Copa Cuiabá',
      dateLabel: '10/09/2026',
      rank: 2,
      points: 5.5,
      category: 'Sub-18',
      validationUrl: 'https://example.com/certificados/abc',
    });
    const text = pdf.toString('ascii');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('(Joao da Silva)');
    expect(text).toContain('(2o lugar  |  5.5 pontos  |  Sub-18)');
    expect(text).toContain('xref');
    expect(text.endsWith('%%EOF')).toBe(true);
  });
});
