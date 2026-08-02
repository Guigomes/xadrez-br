import { describe, it, expect } from 'vitest';
// Import relativo (não '@/...') de propósito: vitest não tem o alias '@/'
// configurado — mesma restrição já anotada em lib/utils/classification-match.ts.
import { chunkMarkdown, parseKbDoc } from '../chunk';

function paragraph(words: number, prefix = 'p'): string {
  return Array.from({ length: words }, (_, i) => `${prefix}${i}`).join(' ');
}

describe('chunkMarkdown', () => {
  it('corpo vazio não gera chunk nenhum', () => {
    expect(chunkMarkdown('')).toEqual([]);
    expect(chunkMarkdown('   \n\n  ')).toEqual([]);
  });

  it('corpo pequeno vira um único chunk', () => {
    const body = `${paragraph(10)}\n\n${paragraph(10)}`;
    const chunks = chunkMarkdown(body);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
  });

  it('nunca corta um parágrafo ao meio', () => {
    const p1 = paragraph(300, 'a');
    const p2 = paragraph(300, 'b');
    const p3 = paragraph(300, 'c');
    const chunks = chunkMarkdown(`${p1}\n\n${p2}\n\n${p3}`);
    // Cada parágrafo inteiro aparece em algum chunk, sem quebra no meio dele.
    for (const p of [p1, p2, p3]) {
      expect(chunks.some((c) => c.content.includes(p))).toBe(true);
    }
  });

  it('estoura o tamanho alvo gera mais de um chunk, em ordem', () => {
    const body = Array.from({ length: 5 }, (_, i) => paragraph(200, `s${i}_`)).join('\n\n');
    const chunks = chunkMarkdown(body);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
  });

  it('overlap repete o final do chunk anterior no início do próximo', () => {
    const p1 = paragraph(400, 'a');
    const p2 = paragraph(400, 'b');
    const p3 = paragraph(400, 'c');
    const chunks = chunkMarkdown(`${p1}\n\n${p2}\n\n${p3}`);
    expect(chunks.length).toBeGreaterThan(1);
    // O segundo chunk começa com o parágrafo que fechou o primeiro (overlap).
    expect(chunks[1].content.startsWith(p1) || chunks[1].content.includes(p1)).toBe(true);
  });
});

describe('parseKbDoc', () => {
  it('extrai frontmatter e corpo', () => {
    const raw = '---\ntitle: Exemplo\naudience: organizador\nslug: exemplo\n---\nConteúdo aqui.';
    const doc = parseKbDoc(raw);
    expect(doc).toEqual({
      title: 'Exemplo', audience: 'organizador', slug: 'exemplo', body: 'Conteúdo aqui.',
    });
  });

  it('lança erro sem frontmatter', () => {
    expect(() => parseKbDoc('Só corpo, sem frontmatter.')).toThrow(/frontmatter/i);
  });

  it('lança erro com campo obrigatório faltando', () => {
    const raw = '---\ntitle: Exemplo\nslug: exemplo\n---\nConteúdo.';
    expect(() => parseKbDoc(raw)).toThrow(/audience/i);
  });
});
