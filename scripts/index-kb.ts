// Lê docs/kb/*.md, quebra em chunks, embeda via Voyage AI e faz upsert em
// kb_chunks (migration 048). content_hash por chunk evita reembeddar o que
// não mudou — idempotente, seguro de rodar de novo.
//
// .ts (não .mjs como os outros scripts/apply-*) porque importa lib/chat/
// chunk.ts e lib/chat/embeddings.ts direto, em vez de duplicar a lógica —
// exige rodar via tsx (devDependency), não node puro.
//
// Uso (VOYAGE_API_KEY não está em .env.local, precisa ser exportada na hora):
//   VOYAGE_API_KEY=<chave> npx tsx scripts/index-kb.ts

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { parseKbDoc, chunkMarkdown } from '../lib/chat/chunk';
import { embedDocument } from '../lib/chat/embeddings';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env.local') });

const KB_DIR = join(__dirname, '..', 'docs', 'kb');

function hashOf(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// Conta Voyage sem cartão cadastrado cai pra 3 RPM (ver dashboard.voyageai.com)
// — sem retry o script quebra no segundo chunk. Só existe aqui (script
// offline, rodado uma vez); embedQuery em tempo de request (route.ts) fica
// sem retry de propósito, pra não estourar o timeout da função serverless.
async function embedWithRetry(text: string, maxRetries = 6): Promise<number[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await embedDocument(text);
    } catch (err: any) {
      if (err?.statusCode !== 429 || attempt >= maxRetries) throw err;
      const waitMs = 21_000;
      console.log(`  rate limit da Voyage — esperando ${waitMs / 1000}s e tentando de novo...`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const voyageKey = process.env.VOYAGE_API_KEY;
  if (!url || !serviceKey) {
    console.error('Faltou NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (deveriam estar em .env.local).');
    process.exit(1);
  }
  if (!voyageKey) {
    console.error('Faltou VOYAGE_API_KEY — exporte na hora, não é uma chave commitada em .env.local.');
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey);

  const files = readdirSync(KB_DIR).filter((f) => f.endsWith('.md'));
  if (files.length === 0) {
    console.error(`Nenhum .md encontrado em ${KB_DIR}.`);
    process.exit(1);
  }

  let embedded = 0;
  let skipped = 0;

  for (const file of files) {
    const raw = readFileSync(join(KB_DIR, file), 'utf8');
    const doc = parseKbDoc(raw);
    const chunks = chunkMarkdown(doc.body);
    console.log(`\n${file} (${doc.slug}) — ${chunks.length} chunk(s)`);

    const { data: existing, error: selError } = await supabase
      .from('kb_chunks')
      .select('chunk_index, content_hash')
      .eq('doc_slug', doc.slug);
    if (selError) throw selError;
    const existingHashes = new Map<number, string>((existing ?? []).map((r: any) => [r.chunk_index, r.content_hash]));

    for (const chunk of chunks) {
      const contentHash = hashOf(chunk.content);
      if (existingHashes.get(chunk.index) === contentHash) {
        console.log(`  [${chunk.index}] sem mudança — pulado`);
        skipped++;
        continue;
      }
      const embedding = await embedWithRetry(chunk.content);
      const { error } = await supabase.from('kb_chunks').upsert({
        doc_slug: doc.slug,
        doc_title: doc.title,
        audience: doc.audience,
        chunk_index: chunk.index,
        content: chunk.content,
        content_hash: contentHash,
        embedding,
      }, { onConflict: 'doc_slug,chunk_index' });
      if (error) throw error;
      console.log(`  [${chunk.index}] indexado (${chunk.content.length} chars)`);
      embedded++;
    }

    // Remove chunks órfãos — documento encolheu, tinha mais chunks antes.
    const currentIndexes = new Set(chunks.map((c) => c.index));
    const orphanIndexes = [...existingHashes.keys()].filter((i) => !currentIndexes.has(i));
    if (orphanIndexes.length > 0) {
      const { error } = await supabase.from('kb_chunks').delete().eq('doc_slug', doc.slug).in('chunk_index', orphanIndexes);
      if (error) throw error;
      console.log(`  removidos ${orphanIndexes.length} chunk(s) órfão(s)`);
    }
  }

  console.log(`\nPronto — ${embedded} chunk(s) indexado(s)/atualizado(s), ${skipped} sem mudança.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
