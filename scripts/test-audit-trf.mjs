// Read-only check of the TRF exported from the two private audit tournaments.
// node --env-file=.env.local --import tsx scripts/test-audit-trf.mjs
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import createModule from '../lib/pairing/wasm/bbppairings.mjs';
import { exportGroupTrf } from '../lib/pairing/service.ts';

const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{
  auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
});
for(const [slug,rounds] of [
  ['teste-inscricoes-anonimas-mvs3eg8j',6],
  ['teste-wo-bye-desempates-mvs3slnh',5],
]){
  const {data:tournament,error}=await client.from('tournaments').select('id,is_public').eq('slug',slug).single();
  if(error)throw error;
  assert.equal(tournament.is_public,false);
  const {data:group,error:groupError}=await client.from('pairing_groups').select('id').eq('tournament_id',tournament.id).single();
  if(groupError)throw groupError;
  const {trf}=await exportGroupTrf(client,slug,group.id);
  const stdout=[],stderr=[];
  const mod=await createModule({noInitialRun:true,print:line=>stdout.push(line),printErr:line=>stderr.push(line)});
  mod.FS.writeFile('/audit.trf',trf);
  let exit;
  try{exit=mod.callMain(['--dutch','/audit.trf','-c']);}
  catch(error){if(typeof error.status==='number')exit=error.status;else throw error;}
  assert.equal(exit,0,stderr.join('\n'));
  assert.deepEqual(stderr,[]);
  // Checker exit 0 does not mean no discrepancy: inspect its report as well.
  assert.equal(stdout.filter(line=>line.includes('Round #')).length,rounds);
  assert.ok(stdout.every(line=>!line.trim()||/^audit: Round #\d+$/.test(line)),stdout.join('\n'));
  console.log('PASS TRF',slug,`${rounds} rounds; exit 0; no discrepancies`);
}
