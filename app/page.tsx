import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { TournamentCard } from '@/components/tournament/tournament-card';
import type { TournamentListItem } from '@/types/database';

/**
 * Home pública. O produto nasceu como "acompanhe torneios ao vivo" e a home
 * refletia isso, mas o núcleo hoje é criar e rodar torneios nativos — quem
 * chega aqui precisa entender em 5 segundos que dá pra montar um torneio,
 * não só assistir a um. Acompanhar continua existindo (é o que traz o público
 * jogador), só que como caminho secundário.
 */

const STEPS = [
  {
    n: 1,
    title: 'Crie o torneio',
    body: 'Nome, cidade, datas, ritmo e número de rodadas. Menos de dois minutos.',
  },
  {
    n: 2,
    title: 'Defina as classificações',
    body: 'Sub-12, feminino, faixa de rating — marque o que usar e cada jogador cai na categoria certa sozinho.',
  },
  {
    n: 3,
    title: 'Abra as inscrições',
    body: 'Compartilhe o link. Os jogadores se inscrevem sozinhos e você aprova com um clique.',
  },
  {
    n: 4,
    title: 'Rode as rodadas',
    body: 'Emparceiramento automático, resultado lançado na hora e classificação sempre atualizada.',
  },
];

const FEATURES = [
  {
    icon: '♟',
    title: 'Emparceiramento automático',
    body: 'Sistema suíço com critérios de desempate configuráveis.',
  },
  {
    icon: '🔗',
    title: 'Link de inscrição',
    body: 'Os jogadores preenchem os próprios dados. Você só aprova.',
  },
  {
    icon: '🏷️',
    title: 'Classificações automáticas',
    body: 'Idade, sexo e rating derivam a categoria de cada participante.',
  },
  {
    icon: '📱',
    title: 'Página pública ao vivo',
    body: 'Jogadores e família acompanham mesa e resultado pelo celular.',
  },
  {
    icon: '🔄',
    title: 'Rating oficial da CBX',
    body: 'Consulta o rating pelo ID cadastrado, sem digitar na mão.',
  },
  {
    icon: '🖨️',
    title: 'Pronto para o salão',
    body: 'Planilhas de emparceiramento e classificação prontas para imprimir.',
  },
];

export default async function HomePage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  // Organizador vai direto pro formulário; quem ainda não ativou o perfil cai
  // no painel, que é onde a ativação acontece. Anônimo passa pelo login.
  let ctaHref = '/login';
  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles').select('role, is_organizer').eq('id', user.id).maybeSingle();
    const canCreate = profile?.role === 'admin' || !!profile?.is_organizer;
    ctaHref = canCreate ? '/admin/tournaments/new' : '/admin';
  }

  const { data: ongoing } = await supabase.rpc('search_tournaments', {
    p_status: 'ongoing', p_limit: 3,
  });
  const { data: upcoming } = await supabase.rpc('search_tournaments', {
    p_status: 'registration', p_limit: 3,
  });

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 text-white">
        <div className="chess-pattern pointer-events-none absolute inset-0" />
        {/* Brilho radial — dá profundidade ao gradiente chapado. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.18),transparent_60%)]" />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden select-none flex-col justify-center gap-4 pr-10 lg:flex xl:pr-20"
          aria-hidden="true"
        >
          <span className="-rotate-6 text-[150px] leading-none text-white/10 drop-shadow-sm">♞</span>
          <span className="rotate-6 pl-20 text-[80px] leading-none text-white/[0.07]">♛</span>
        </div>

        <div className="container-app relative py-16 sm:py-24">
          <div className="max-w-2xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium text-brand-100 backdrop-blur-sm">
              <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
              Sem instalar nada · funciona no celular
            </p>
            <h1 className="mb-4 text-3xl font-bold leading-tight sm:text-5xl">
              Organize seu torneio de xadrez do começo ao fim
            </h1>
            <p className="mb-8 text-lg leading-relaxed text-brand-100">
              Inscrição online, emparceiramento automático, classificação por categoria
              e uma página pública ao vivo — tudo no navegador.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={ctaHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-6 py-3.5 font-semibold text-brand-700 shadow-lg shadow-brand-950/20 transition-transform hover:scale-[1.02] hover:bg-brand-50"
              >
                Criar meu torneio
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link
                href="/tournaments"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/30 px-6 py-3.5 font-semibold text-white transition-colors hover:bg-white/10"
              >
                <span aria-hidden="true">♟</span> Acompanhar torneios
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Como funciona — dá o modelo mental do fluxo antes de qualquer clique.
          É o mesmo caminho que o tour guiado percorre dentro do painel. */}
      <section className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
        <div className="container-app py-12 sm:py-16">
          <h2 className="mb-2 text-center text-2xl font-bold text-gray-900 dark:text-gray-100">
            Como funciona
          </h2>
          <p className="mx-auto mb-10 max-w-xl text-center text-sm text-gray-500 dark:text-gray-400">
            Quatro etapas do zero ao primeiro pareamento na mesa.
          </p>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="card p-5">
                {/* Número e título na mesma linha: no mobile os 4 passos viram
                    uma coluna só, e empilhar o círculo acima do texto esticava
                    demais a página. */}
                <div className="mb-2 flex items-center gap-3">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    {s.n}
                  </span>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">{s.title}</p>
                </div>
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Recursos */}
      <section className="container-app py-12 sm:py-16">
        <h2 className="mb-2 text-center text-2xl font-bold text-gray-900 dark:text-gray-100">
          O que vem pronto
        </h2>
        <p className="mx-auto mb-10 max-w-xl text-center text-sm text-gray-500 dark:text-gray-400">
          O trabalho chato do organizador, resolvido.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-5 transition-colors hover:border-brand-200 dark:hover:border-brand-800">
              <span
                className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-2xl leading-none text-brand-600 dark:bg-brand-950/60 dark:text-brand-400"
                aria-hidden="true"
              >
                {f.icon}
              </span>
              <p className="mb-1 font-semibold text-gray-900 dark:text-gray-100">{f.title}</p>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Torneios reais — prova de que a coisa roda, e a porta de entrada de
          quem chegou aqui pra jogar/acompanhar, não pra organizar. */}
      {((ongoing?.length ?? 0) > 0 || (upcoming?.length ?? 0) > 0) && (
        <section className="border-t border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
          <div className="container-app space-y-10 py-12 sm:py-16">
            {(ongoing?.length ?? 0) > 0 && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
                    <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Acontecendo agora</h2>
                  </div>
                  <Link href="/tournaments?status=ongoing" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
                    Ver todos
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(ongoing as TournamentListItem[]).map((t) => (
                    <TournamentCard key={t.id} tournament={t} />
                  ))}
                </div>
              </div>
            )}

            {(upcoming?.length ?? 0) > 0 && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Inscrições abertas</h2>
                  <Link href="/tournaments?status=registration" className="text-sm text-brand-600 hover:underline dark:text-brand-400">
                    Ver todos
                  </Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(upcoming as TournamentListItem[]).map((t) => (
                    <TournamentCard key={t.id} tournament={t} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Fechamento */}
      <section className="container-app py-12 sm:py-16">
        <div className="card overflow-hidden bg-gradient-to-br from-brand-50 to-white p-8 text-center sm:p-12 dark:from-brand-950/40 dark:to-gray-900">
          <p className="mb-4 text-4xl" aria-hidden="true">♞</p>
          <h2 className="mb-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            Seu próximo torneio começa aqui
          </h2>
          <p className="mx-auto mb-6 max-w-md text-gray-600 dark:text-gray-400">
            Escolar, de clube ou aberto — monte a estrutura uma vez e deixe o sistema
            cuidar de pareamento, classificação e divulgação.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={ctaHref}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-brand-700"
            >
              Criar meu torneio
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
            <Link
              href="/players"
              className="text-sm font-medium text-gray-600 hover:text-brand-600 dark:text-gray-400 dark:hover:text-brand-400"
            >
              Sou jogador, quero buscar meu histórico →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
