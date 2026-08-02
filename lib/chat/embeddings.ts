import { VoyageAIClient } from 'voyageai';

// voyage-4-lite com output_dimension=512: dimensão fixada pra bater com a
// coluna `embedding vector(512)` de kb_chunks (migration 048). Mudar aqui
// exige mudar a coluna também (e reindexar tudo — embeddings de dimensões
// diferentes não são comparáveis).
const MODEL = 'voyage-4-lite';
const OUTPUT_DIMENSION = 512;

let _client: VoyageAIClient | null = null;
function getClient(): VoyageAIClient {
  if (!_client) {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error('VOYAGE_API_KEY não configurada.');
    _client = new VoyageAIClient({ apiKey });
  }
  return _client;
}

/**
 * Embeda um chunk da base de conhecimento (scripts/index-kb.mjs).
 * inputType 'document' — par assimétrico com embedQuery('query'), que a
 * Voyage recomenda pra melhorar a qualidade da recuperação em RAG.
 */
export async function embedDocument(text: string): Promise<number[]> {
  const res = await getClient().embed({ input: text, model: MODEL, outputDimension: OUTPUT_DIMENSION, inputType: 'document' });
  const embedding = res.data?.[0]?.embedding;
  if (!embedding) throw new Error('Voyage não devolveu embedding.');
  return embedding;
}

/** Embeda a pergunta do usuário (app/api/chat/message/route.ts) — ver embedDocument. */
export async function embedQuery(text: string): Promise<number[]> {
  const res = await getClient().embed({ input: text, model: MODEL, outputDimension: OUTPUT_DIMENSION, inputType: 'query' });
  const embedding = res.data?.[0]?.embedding;
  if (!embedding) throw new Error('Voyage não devolveu embedding.');
  return embedding;
}
