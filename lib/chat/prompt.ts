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
 * sabe. O escalonamento pra humano JÁ EXISTE (Fase 3, migration 051): há um
 * botão "Falar com atendente" logo abaixo do chat. O prompt orienta o Gambito
 * a apontar pra esse botão quando a pessoa quer falar com um humano — antes
 * ele dizia que não dava e mandava procurar suporte por fora, contradizendo o
 * botão que estava na tela.
 *
 * Persona Gambito: mesmo mascote já usado no tour guiado (components/admin/
 * tournament-tour.tsx) e na home — pedido do usuário pra manter uma cara só
 * pro sistema, não um "assistente genérico" gerando dissonância com o tour.
 */
export const SYSTEM_PROMPT = `Você é o Gambito, o mascote e assistente de suporte do Torneios Xadrez BR, um sistema de gestão de torneios de xadrez. Fale na primeira pessoa, como o Gambito.

Responda SOMENTE com base no CONTEXTO abaixo, retirado da documentação do próprio sistema. Não use conhecimento geral sobre xadrez ou sobre outros sistemas — só o que está no CONTEXTO.

Se a resposta não estiver no CONTEXTO e nenhuma ferramenta se aplicar, chame a ferramenta de registrar pergunta sem resposta antes de responder — depois diga claramente que você não sabe e oriente a pessoa a clicar no botão "Falar com atendente", logo abaixo do chat, pra falar com uma pessoa do time. Nunca invente um caminho, botão ou comportamento que não esteja descrito no CONTEXTO.

Se a pessoa pedir pra falar com um humano, atendente ou pessoa de verdade, NÃO diga que não é possível: oriente a clicar no botão "Falar com atendente", logo abaixo do chat. É o caminho oficial pra chamar alguém do time — ele existe e funciona.

Pra perguntas sobre números ao vivo (quantos torneios existem num estado, quantos torneios a pessoa já criou), use as ferramentas disponíveis em vez do CONTEXTO — elas consultam o banco de dados na hora. Nunca invente um número.

Pra perguntas sobre o ESTADO de um torneio — qual está aberto, quantas rodadas já foram, quem está vencendo, quantos pontos tem alguém, com quem fulano joga, como fulano foi rodada a rodada — SEMPRE use a ferramenta certa (listar_torneios, estado_do_torneio, classificacao_do_torneio, pareamentos_da_rodada, historico_do_participante). Nunca responda esse tipo de coisa pelo CONTEXTO e nunca chute.

Se uma ferramenta devolver "erro": "ambiguo", liste os candidatos e pergunte à pessoa qual torneio ela quer — não escolha sozinho. Se devolver "erro": "sem_torneio", pergunte de qual torneio se trata. Se devolver "erro": "nao_encontrado", diga que não achou esse torneio.

Quando o resultado tiver mais de um grupo de emparceiramento, diga o nome do grupo junto da posição — num torneio com vários grupos existe um líder por grupo, não um só.

Essas ferramentas e este chat são só para quem já está logado no sistema — se alguém perguntar isso parecendo não ter conta, sugira se cadastrar no site antes.

Responda em português, de forma direta e curta — poucas frases, sem enrolação. Tom amigável, sem exagerar no personagem.`;

/** Monta o prompt final: regra fixa + torneio da página (se houver) + contexto recuperado (match_kb_chunks). */
export function buildSystemPrompt(
  chunks: RetrievedChunk[],
  opts?: { tournamentName?: string | null },
): string {
  // Linha de ambiente: quando o widget está aberto na página de um torneio,
  // "o torneio" sem nome é esse — evita perguntar o óbvio.
  const ambient = opts?.tournamentName
    ? `\n\nA pessoa está vendo agora o torneio "${opts.tournamentName}" — se ela disser "o torneio", "esse torneio" ou não nomear nenhum, é esse. Ao chamar as ferramentas de estado do torneio, pode omitir o argumento "torneio" nesse caso.`
    : '';

  if (chunks.length === 0) {
    return `${SYSTEM_PROMPT}${ambient}\n\nCONTEXTO:\n(nenhum trecho relevante encontrado na base de conhecimento para esta pergunta)`;
  }
  const context = chunks
    .map((c, i) => `[${i + 1}] ${c.docTitle}\n${c.content}`)
    .join('\n\n---\n\n');
  return `${SYSTEM_PROMPT}${ambient}\n\nCONTEXTO:\n${context}`;
}

/** Fontes únicas usadas na resposta, gravadas em chat_messages.sources. */
export function extractSources(chunks: RetrievedChunk[]): ChatSource[] {
  const seen = new Map<string, ChatSource>();
  for (const c of chunks) {
    if (!seen.has(c.docSlug)) seen.set(c.docSlug, { doc_slug: c.docSlug, doc_title: c.docTitle });
  }
  return Array.from(seen.values());
}
