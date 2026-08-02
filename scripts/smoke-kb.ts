// Roda perguntas reais contra match_kb_chunks e imprime os chunks
// recuperados — verificação manual da qualidade da busca antes de avançar
// pro bot (Fase 2). LER A SAÍDA DE VERDADE, não só o exit code: se a
// recuperação estiver ruim aqui, todo o resto herda o erro (§6 do plano).
//
// Uso:
//   VOYAGE_API_KEY=<chave> npx tsx scripts/smoke-kb.ts

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { embedQuery } from '../lib/chat/embeddings';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

// Perguntas de organizador/inscrito de verdade, incluindo umas mal
// formuladas/com sinônimo de propósito (§4 do plano: é exatamente onde
// busca lexical pura falharia, e onde embeddings deveriam ganhar).
const QUESTIONS = [
  'como eu abro as inscrições do meu torneio?',
  'por que a aba Rodadas não aparece pro meu torneio?',
  'como mudo a classificação de um jogador que cadastrei errado?',
  'qual a diferença entre classificação e emparceiramento?',
  'como sorteio as mesas da primeira rodada?', // sinônimo de "parear"
  'o jogador entrou no meio do torneio, ele recebe bye?',
  'preciso pedir rating na inscrição?',
  'como faço pra excluir um torneio?',
  'cancelar é a mesma coisa que excluir?',
  'quem pode lançar resultado de uma partida?',
];

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('Faltou NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (deveriam estar em .env.local).');
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey);

  for (const question of QUESTIONS) {
    console.log(`\n${'='.repeat(70)}\nPERGUNTA: ${question}`);
    const embedding = await embedQuery(question);
    const { data, error } = await supabase.rpc('match_kb_chunks', {
      query_embedding: embedding,
      match_count: 3,
      min_similarity: 0.3,
    });
    if (error) {
      console.error('  ERRO:', error.message);
      continue;
    }
    if (!data || data.length === 0) {
      console.log('  (nenhum chunk acima do limiar de similaridade)');
      continue;
    }
    for (const row of data as any[]) {
      console.log(`  [${row.similarity.toFixed(3)}] ${row.doc_title}`);
      console.log(`    ${row.content.slice(0, 150).replace(/\n/g, ' ')}...`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
