export interface Chunk {
  index: number;
  content: string;
}

export interface KbDoc {
  title: string;
  audience: string;
  slug: string;
  body: string;
}

const CHUNK_SIZE_WORDS = 500;
const OVERLAP_WORDS = 50;

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Quebra o corpo (sem frontmatter) em pedaços de ~500 palavras, com overlap
 * de ~50 — nunca corta um parágrafo ao meio: agrupa parágrafos inteiros até
 * estourar o tamanho alvo, e o overlap devolve os últimos parágrafos do
 * chunk que acabou de fechar como início do próximo (parágrafo inteiro, não
 * corte palavra a palavra). Palavra é usada como proxy de token — evita
 * depender de um tokenizer real pra uma base pequena e o tamanho é só um
 * heurístico, não algo cobrado com precisão.
 */
export function chunkMarkdown(body: string): Chunk[] {
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentWords = 0;

  function flush() {
    if (current.length === 0) return;
    chunks.push({ index: chunks.length, content: current.join('\n\n') });
  }

  for (const p of paragraphs) {
    const pWords = wordCount(p);
    if (currentWords > 0 && currentWords + pWords > CHUNK_SIZE_WORDS) {
      flush();
      // Overlap: últimos parágrafos do chunk que fechou, até ~OVERLAP_WORDS.
      const overlapParagraphs: string[] = [];
      let overlapWords = 0;
      for (let i = current.length - 1; i >= 0 && overlapWords < OVERLAP_WORDS; i--) {
        overlapParagraphs.unshift(current[i]);
        overlapWords += wordCount(current[i]);
      }
      current = overlapParagraphs;
      currentWords = overlapWords;
    }
    current.push(p);
    currentWords += pWords;
  }
  flush();

  return chunks;
}

/**
 * Frontmatter dos docs/kb/*.md é sempre 3 chaves planas (title/audience/
 * slug) — parser à mão em vez de puxar uma lib de YAML só pra isso.
 */
export function parseKbDoc(raw: string): KbDoc {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error('Documento sem frontmatter (esperado "---" no início e no fim dele).');
  }
  const [, frontmatter, body] = match;
  const fields: Record<string, string> = {};
  for (const line of frontmatter.split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) fields[m[1]] = m[2].trim();
  }
  for (const key of ['title', 'audience', 'slug']) {
    if (!fields[key]) throw new Error(`Frontmatter sem campo obrigatório: ${key}`);
  }
  return { title: fields.title, audience: fields.audience, slug: fields.slug, body: body.trim() };
}
