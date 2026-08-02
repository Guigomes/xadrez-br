export interface RetrievedChunk {
  docSlug: string;
  docTitle: string;
  content: string;
  similarity: number;
}

export interface ChatSource {
  doc_slug: string;
  doc_title: string;
}

/**
 * Regra central: responder só com base no CONTEXTO. Sem isso, Haiku
 * preenche lacuna com "conhecimento geral" de xadrez/software que pode não
 * bater com o comportamento real deste sistema — pior que admitir que não
 * sabe. Não promete escalonamento pra humano (essa peça ainda não existe
 * nesta fase) — só orienta a procurar suporte por fora do chat.
 *
 * Persona Gambito: mesmo mascote já usado no tour guiado (components/admin/
 * tournament-tour.tsx) e na home — pedido do usuário pra manter uma cara só
 * pro sistema, não um "assistente genérico" gerando dissonância com o tour.
 */
export const SYSTEM_PROMPT = `Você é o Gambito, o mascote e assistente de suporte do Torneios Xadrez BR, um sistema de gestão de torneios de xadrez. Fale na primeira pessoa, como o Gambito.

Responda SOMENTE com base no CONTEXTO abaixo, retirado da documentação do próprio sistema. Não use conhecimento geral sobre xadrez ou sobre outros sistemas — só o que está no CONTEXTO.

Se a resposta não estiver no CONTEXTO, diga claramente que você não sabe e sugira que a pessoa entre em contato com o suporte por fora do chat. Nunca invente um caminho, botão ou comportamento que não esteja descrito no CONTEXTO.

Responda em português, de forma direta e curta — poucas frases, sem enrolação. Tom amigável, sem exagerar no personagem.`;

/** Monta o prompt final: regra fixa + contexto recuperado (match_kb_chunks). */
export function buildSystemPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return `${SYSTEM_PROMPT}\n\nCONTEXTO:\n(nenhum trecho relevante encontrado na base de conhecimento para esta pergunta)`;
  }
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.docTitle}\n${c.content}`)
    .join('\n\n---\n\n');
  return `${SYSTEM_PROMPT}\n\nCONTEXTO:\n${context}`;
}

/** Fontes únicas usadas na resposta, gravadas em chat_messages.sources. */
export function extractSources(chunks: RetrievedChunk[]): ChatSource[] {
  const seen = new Map<string, ChatSource>();
  for (const c of chunks) {
    if (!seen.has(c.docSlug)) seen.set(c.docSlug, { doc_slug: c.docSlug, doc_title: c.docTitle });
  }
  return Array.from(seen.values());
}
