import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/server';

export default async function CertificateValidationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data } = await admin.from('tournament_players')
    .select('current_score, current_rank, players(full_name), tournaments(name, slug, status, is_public)')
    .eq('id', id).maybeSingle();
  const row = data as unknown as { current_score: number; current_rank: number | null; players: { full_name: string } | null; tournaments: { name: string; slug: string; status: string; is_public: boolean } | null } | null;
  if (!row?.players || !row.tournaments?.is_public || row.tournaments.status !== 'finished') notFound();
  return <main className="container-app max-w-2xl py-12"><div className="card border-green-200 p-7 text-center dark:border-green-900"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-100 text-2xl text-green-700">✓</div><h1 className="mt-4 text-2xl font-bold">Certificado válido</h1><p className="mt-2 text-gray-600 dark:text-gray-400">Participação de <strong>{row.players.full_name}</strong> em <strong>{row.tournaments.name}</strong>.</p><p className="mt-2 text-sm text-gray-500">{row.current_score} pontos{row.current_rank ? ` · ${row.current_rank}º lugar` : ''}</p><div className="mt-6 flex justify-center gap-4"><a href={`/api/certificates/${id}`} className="font-semibold text-brand-600 hover:underline">Abrir PDF</a><Link href={`/tournaments/${row.tournaments.slug}`} className="font-semibold text-brand-600 hover:underline">Ver torneio</Link></div></div></main>;
}
