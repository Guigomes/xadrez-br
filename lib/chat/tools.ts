import type { SupabaseClient } from '@supabase/supabase-js';
import type { StandingRow, RoundPairingRow, PlayerHistoryRow } from '@/types/database';
import { summarizeRounds } from '@/lib/utils/rounds';
import { isRegistrationClosed } from '@/lib/utils/chess';
import {
  resolveTournament,
  matchPlayerNames,
  normalizeName,
  type ResolvedTournament,
  type TournamentResolution,
} from './tournament-context';

/**
 * Ferramentas de dado ao vivo do Gambito. Duas famílias:
 *
 * 1. CONTAGEM / BUSCA GENÉRICA que não cabe em busca semântica sobre a KB
 *    estática (docs/kb) — precisa de dado real no banco.
 * 2. ESTADO DE UM TORNEIO ESPECÍFICO (rodadas, classificação, pareamentos,
 *    histórico) — "quem está vencendo", "quantos pontos tem fulano".
 *
 * Lista fechada de propósito: o bot NÃO é interface de query genérica (o
 * plano original nunca quis o bot executando ações/consultas livres). A lista
 * cresceu de 3 pra 8 leituras NOMEADAS — segue fechada, cada ferramenta é uma
 * pergunta concreta, não um SELECT arbitrário.
 *
 * Todas as ferramentas de leitura usam ctx.supabase (RLS do usuário), nunca
 * ctx.admin — rascunho alheio fica invisível de graça pelo banco. ctx.admin
 * só serve pra registrar_pergunta_sem_resposta (tabela sem policy de insert
 * pro client comum, de propósito).
 *
 * Formato neutro (JSON Schema puro), não amarrado ao SDK de nenhum provedor —
 * lib/chat/llm.ts adapta pro formato de tool calling específico.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'contar_torneios_por_estado',
    description:
      'Conta quantos torneios públicos (já publicados, não em rascunho) existem hoje em um estado brasileiro (UF).',
    parameters: {
      type: 'object',
      properties: {
        estado: { type: 'string', description: 'Sigla do estado (UF), ex: MS, SP, RJ.' },
      },
      required: ['estado'],
    },
  },
  {
    name: 'contar_meus_torneios',
    description: 'Conta quantos torneios o usuário logado (quem está conversando agora) já criou, em qualquer status.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'listar_torneios',
    description:
      'Lista torneios (nome, cidade, status, se está com inscrições abertas). Use para "quais torneios estão abertos/acontecendo?", "tem torneio em SP?", "quais os meus torneios?". Traz no máximo 5.',
    parameters: {
      type: 'object',
      properties: {
        estado: { type: 'string', description: 'Filtrar por UF, ex: SP, MS. Opcional.' },
        situacao: {
          type: 'string',
          description:
            'Filtrar por situação: "inscricoes" (inscrições abertas), "em_andamento" (rodadas rolando) ou "qualquer" (padrão).',
          enum: ['inscricoes', 'em_andamento', 'qualquer'],
        },
        apenas_meus: { type: 'boolean', description: 'Se true, só torneios criados pelo usuário logado.' },
      },
    },
  },
  {
    name: 'estado_do_torneio',
    description:
      'Situação geral de UM torneio: status, quantas rodadas já foram (finalizadas) de quantas previstas, qual a rodada atual, quantos participantes, quais os grupos de emparceiramento. Use para "quantas rodadas já foram?", "em que pé está o torneio?", "quantos jogadores tem?". NÃO traz a classificação nem pontos — para isso use classificacao_do_torneio.',
    parameters: {
      type: 'object',
      properties: {
        torneio: {
          type: 'string',
          description:
            'Nome ou slug do torneio. Omita se a pessoa está vendo a página de um torneio (o sistema usa o torneio atual).',
        },
      },
    },
  },
  {
    name: 'classificacao_do_torneio',
    description:
      'Classificação ATUAL de um torneio: quem está na frente e com quantos pontos NESTE momento. Use para "quem está ganhando?", "quem lidera?", "quantos pontos tem o Fulano?". Se passar "participante", devolve a posição e os pontos dessa pessoa. Sem "participante", devolve os líderes de cada grupo. Para o desempenho rodada a rodada de alguém use historico_do_participante.',
    parameters: {
      type: 'object',
      properties: {
        torneio: { type: 'string', description: 'Nome ou slug. Omita para usar o torneio da página atual.' },
        participante: { type: 'string', description: 'Nome (ou parte) de um jogador, para ver a pontuação dele.' },
        top: { type: 'integer', description: 'Quantos líderes por grupo trazer (padrão 3, máximo 10).' },
      },
    },
  },
  {
    name: 'pareamentos_da_rodada',
    description:
      'Confrontos de uma rodada: quem joga contra quem, em que mesa, com que cor, e o resultado se já saiu. Use para "com quem o Fulano joga na rodada 3?", "quais os jogos da rodada 2?", "em que mesa eu jogo?". Se omitir a rodada, usa a mais recente.',
    parameters: {
      type: 'object',
      properties: {
        torneio: { type: 'string', description: 'Nome ou slug. Omita para usar o torneio da página atual.' },
        rodada: { type: 'integer', description: 'Número da rodada. Omita para a rodada mais recente.' },
        participante: { type: 'string', description: 'Nome (ou parte) para filtrar só a mesa desse jogador.' },
      },
    },
  },
  {
    name: 'historico_do_participante',
    description:
      'Desempenho de UM jogador rodada a rodada num torneio: adversário, cor, resultado e pontos acumulados em cada rodada. Use para "como o Fulano foi até agora?", "contra quem ele já jogou?". Para só a posição/pontos atuais, use classificacao_do_torneio.',
    parameters: {
      type: 'object',
      properties: {
        torneio: { type: 'string', description: 'Nome ou slug. Omita para usar o torneio da página atual.' },
        participante: { type: 'string', description: 'Nome (ou parte) do jogador. Obrigatório.' },
      },
      required: ['participante'],
    },
  },
  {
    name: 'registrar_pergunta_sem_resposta',
    description:
      'Chame isso SEMPRE que você não conseguir responder — a pergunta não está no CONTEXTO e nenhuma outra ferramenta se aplica. Registra a pergunta pra alguém do time revisar depois e melhorar o sistema. Chame antes de dizer que não sabe, nunca em vez de responder quando você já sabe a resposta.',
    parameters: { type: 'object', properties: {} },
  },
];

export interface ToolContext {
  /** Client autenticado como o próprio usuário — RLS aplica, nunca service_role. Usado por TODAS as ferramentas de leitura. */
  supabase: SupabaseClient;
  /** Null quando o chat está em modo anônimo (CHAT_ALLOW_ANONYMOUS). Ferramentas que dependem de "meus dados" recusam nesse caso. */
  userId: string | null;
  /** Só pra registrar_pergunta_sem_resposta — essa tabela não tem policy de insert pro client comum, de propósito. */
  admin: SupabaseClient;
  sessionId: string;
  /** Pergunta original do usuário nesta mensagem — não confia no modelo reescrever, evita deriva/paráfrase no registro. */
  originalQuestion: string;
  /** Slug do torneio da página onde o widget está aberto (ambiente). Null fora de páginas de torneio. */
  tournamentSlug?: string | null;
  /** Torneio já resolvido pela rota a partir de tournamentSlug — evita re-consultar quando a pessoa não nomeia outro. */
  tournament?: ResolvedTournament | null;
}

// ============================================================
// Helpers de resolução de torneio
// ============================================================

async function resolveForTool(ctx: ToolContext, hint: unknown): Promise<TournamentResolution> {
  const hintStr = typeof hint === 'string' ? hint.trim() : '';
  // Sem hint e a rota já resolveu o torneio da página → reaproveita, sem ir ao banco.
  if (!hintStr && ctx.tournament) return { ok: true, torneio: ctx.tournament };
  return resolveTournament(ctx.supabase, hint, ctx.tournamentSlug ?? null);
}

/** Traduz falha de resolução num resultado que orienta o modelo a perguntar/escolher. */
function resolutionErrorResult(res: Extract<TournamentResolution, { ok: false }>): Record<string, unknown> {
  if (res.erro === 'ambiguo') {
    return {
      erro: 'ambiguo',
      mensagem: 'Vários torneios batem com esse nome. Peça pra pessoa escolher qual.',
      candidatos: res.candidatos,
    };
  }
  if (res.erro === 'nao_encontrado') {
    return { erro: 'nao_encontrado', mensagem: 'Não achei nenhum torneio com esse nome.' };
  }
  return { erro: 'sem_torneio', mensagem: 'Não sei de qual torneio se trata. Pergunte o nome do torneio.' };
}

const STATUS_MAP: Record<string, string> = { inscricoes: 'registration', em_andamento: 'ongoing' };

// ============================================================
// Ferramentas de leitura por torneio
// ============================================================

async function toolListarTorneios(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const estado = typeof args.estado === 'string' ? args.estado.trim().toUpperCase().slice(0, 2) : '';
  const situacao = typeof args.situacao === 'string' ? args.situacao : 'qualquer';
  const apenasMeus = args.apenas_meus === true;
  const status = situacao !== 'qualquer' ? STATUS_MAP[situacao] : undefined;

  if (apenasMeus && !ctx.userId) {
    return { erro: 'login_necessario', mensagem: 'Só consigo listar os SEUS torneios se você estiver logado.' };
  }
  if (apenasMeus) {
    let q = ctx.supabase
      .from('tournaments')
      .select('name, slug, city, state, status, start_date, registration_end_date, registration_closes_by_date')
      .eq('created_by', ctx.userId)
      .order('start_date', { ascending: false })
      .limit(5);
    if (estado) q = q.eq('state', estado);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return {
      total: data?.length ?? 0,
      torneios: (data ?? []).map((t: any) => ({
        nome: t.name,
        slug: t.slug,
        cidade: t.city,
        estado: t.state,
        status: t.status,
        inicio: t.start_date,
        inscricoes_abertas: !isRegistrationClosed(t.status, t.registration_end_date, t.registration_closes_by_date),
      })),
    };
  }

  const { data, error } = await ctx.supabase.rpc('search_tournaments', {
    p_query: undefined,
    p_state: estado || undefined,
    p_status: (status as any) || undefined,
    p_limit: 5,
    p_offset: 0,
  });
  if (error) return { error: error.message };
  return {
    total: data?.length ?? 0,
    torneios: (data ?? []).map((t: any) => ({
      nome: t.name,
      slug: t.slug,
      cidade: t.city,
      estado: t.state,
      status: t.status,
      inicio: t.start_date,
      participantes: t.player_count,
      inscricoes_abertas: !isRegistrationClosed(t.status, t.registration_end_date, t.registration_closes_by_date),
    })),
  };
}

async function toolEstadoDoTorneio(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const res = await resolveForTool(ctx, args.torneio);
  if (!res.ok) return resolutionErrorResult(res);
  const t = res.torneio;

  const [{ data: roundRows }, { count: participantes }, { data: groups }] = await Promise.all([
    ctx.supabase.from('rounds').select('round_number, status, published_at').eq('tournament_id', t.id),
    ctx.supabase
      .from('tournament_players')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', t.id)
      .eq('status', 'active'),
    ctx.supabase.from('pairing_groups').select('name, sort_order').eq('tournament_id', t.id).order('sort_order'),
  ]);

  const { rounds } = summarizeRounds(roundRows ?? []);
  const finalizadas = rounds.filter((r) => r.status === 'finished').length;
  const atual = rounds.length ? rounds[rounds.length - 1] : null;

  return {
    torneio: t.name,
    status: t.status,
    rodadas_previstas: t.rounds_count,
    rodadas_finalizadas: finalizadas,
    rodada_atual: atual ? { numero: atual.roundNumber, status: atual.status } : null,
    participantes: participantes ?? 0,
    grupos: (groups ?? []).map((g: any) => g.name),
  };
}

/** Agrupa linhas da classificação por grupo de emparceiramento, preservando a ordem (rank) do RPC. */
function groupStandings(rows: StandingRow[]): { grupo: string | null; linhas: StandingRow[] }[] {
  const order: string[] = [];
  const byGroup = new Map<string, StandingRow[]>();
  for (const r of rows) {
    const key = r.pairing_group_id ?? '__none__';
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key)!.push(r);
  }
  return order.map((key) => ({
    grupo: byGroup.get(key)![0].pairing_group_name,
    linhas: byGroup.get(key)!,
  }));
}

async function toolClassificacaoDoTorneio(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const res = await resolveForTool(ctx, args.torneio);
  if (!res.ok) return resolutionErrorResult(res);
  const t = res.torneio;

  const { data, error } = await ctx.supabase.rpc('get_tournament_standings', { p_tournament_id: t.id });
  if (error) return { error: error.message };
  const rows = (data ?? []) as StandingRow[];
  if (rows.length === 0) return { torneio: t.name, mensagem: 'Ainda não há classificação (nenhuma rodada pontuada).' };

  // Filtro por participante: posição e pontos dessa pessoa.
  const participante = typeof args.participante === 'string' ? args.participante.trim() : '';
  if (participante) {
    const matches = matchPlayerNames(rows, participante, 6);
    if (matches.length === 0) return { torneio: t.name, encontrados: [], mensagem: 'Nenhum participante com esse nome.' };
    if (matches.length > 5) {
      return { torneio: t.name, mensagem: 'Muitos jogadores com esse nome — peça o nome completo.' };
    }
    return {
      torneio: t.name,
      encontrados: matches.map((r) => ({
        nome: r.full_name,
        grupo: r.pairing_group_name,
        posicao: r.rank,
        pontos: r.points,
        jogos: r.games_played,
        vitorias: r.wins,
        empates: r.draws,
        derrotas: r.losses,
        categoria: r.category_name,
      })),
    };
  }

  // Líderes por grupo.
  const topRaw = typeof args.top === 'number' ? args.top : 3;
  const top = Math.min(Math.max(1, Math.floor(topRaw)), 10);
  return {
    torneio: t.name,
    grupos: groupStandings(rows).map((g) => ({
      grupo: g.grupo,
      lideres: g.linhas.slice(0, top).map((r) => ({
        posicao: r.rank,
        nome: r.full_name,
        pontos: r.points,
        jogos: r.games_played,
      })),
    })),
  };
}

async function toolPareamentosDaRodada(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const res = await resolveForTool(ctx, args.torneio);
  if (!res.ok) return resolutionErrorResult(res);
  const t = res.torneio;

  const { data: roundRows, error: rErr } = await ctx.supabase
    .from('rounds')
    .select('id, round_number, status')
    .eq('tournament_id', t.id)
    .neq('status', 'draft');
  if (rErr) return { error: rErr.message };
  if (!roundRows || roundRows.length === 0) return { torneio: t.name, mensagem: 'Nenhuma rodada publicada ainda.' };

  // Rodada alvo: a pedida, ou a maior existente.
  const pedida = typeof args.rodada === 'number' ? Math.floor(args.rodada) : null;
  const numeros = Array.from(new Set(roundRows.map((r: any) => r.round_number)));
  const alvo = pedida ?? Math.max(...numeros);
  const idsAlvo = roundRows.filter((r: any) => r.round_number === alvo);
  if (idsAlvo.length === 0) return { torneio: t.name, mensagem: `A rodada ${alvo} ainda não foi publicada.` };

  // Multi-grupo: um número de rodada = várias linhas (uma por grupo). Junta os pareamentos de todas.
  const perRound = await Promise.all(
    idsAlvo.map((r: any) => ctx.supabase.rpc('get_round_pairings', { p_round_id: r.id })),
  );
  const pairings: RoundPairingRow[] = [];
  for (const pr of perRound) {
    if (pr.error) return { error: pr.error.message };
    pairings.push(...((pr.data ?? []) as RoundPairingRow[]));
  }

  const participante = typeof args.participante === 'string' ? args.participante.trim() : '';
  let partidas = pairings;
  if (participante) {
    // Filtra as mesas em que o jogador aparece de qualquer lado (tolerante a acento/caixa).
    const q = normalizeName(participante);
    partidas = pairings.filter(
      (p) => normalizeName(p.white_name).includes(q) || normalizeName(p.black_name).includes(q),
    );
  }

  const statusRodada = summarizeRounds(idsAlvo.map((r: any) => ({ round_number: r.round_number, status: r.status }))).rounds[0]?.status ?? 'pending';

  return {
    torneio: t.name,
    rodada: alvo,
    status: statusRodada,
    partidas: partidas.slice(0, 10).map((p) => ({
      mesa: p.board_number,
      brancas: p.white_name,
      pretas: p.black_name,
      resultado: p.result === '*' ? null : p.result,
    })),
    total_partidas: partidas.length,
  };
}

async function toolHistoricoDoParticipante(args: Record<string, unknown>, ctx: ToolContext): Promise<Record<string, unknown>> {
  const participante = typeof args.participante === 'string' ? args.participante.trim() : '';
  if (!participante) return { error: 'Participante não informado.' };

  const res = await resolveForTool(ctx, args.torneio);
  if (!res.ok) return resolutionErrorResult(res);
  const t = res.torneio;

  // Nome → tp_id via classificação (que já traz full_name + tp_id).
  const { data: stData, error: stErr } = await ctx.supabase.rpc('get_tournament_standings', { p_tournament_id: t.id });
  if (stErr) return { error: stErr.message };
  const rows = (stData ?? []) as StandingRow[];
  const matches = matchPlayerNames(rows, participante, 6);
  if (matches.length === 0) return { torneio: t.name, mensagem: 'Nenhum participante com esse nome.' };
  if (matches.length > 1) {
    return {
      torneio: t.name,
      mensagem: 'Mais de um jogador com esse nome — peça o nome completo.',
      candidatos: matches.map((r) => r.full_name),
    };
  }
  const alvo = matches[0];

  const { data: hist, error: hErr } = await ctx.supabase.rpc('get_player_tournament_history', {
    p_tournament_id: t.id,
    p_tp_id: alvo.tp_id,
  });
  if (hErr) return { error: hErr.message };

  return {
    torneio: t.name,
    participante: alvo.full_name,
    pontos_totais: alvo.points,
    rodadas: ((hist ?? []) as PlayerHistoryRow[]).map((h) => ({
      rodada: h.round_number,
      cor: h.color === 'white' ? 'brancas' : 'pretas',
      adversario: h.is_bye ? null : h.opponent_name,
      bye: h.is_bye,
      resultado: h.result === '*' ? null : h.result,
      pontos_acumulados: h.cumulative_pts,
    })),
  };
}

// ============================================================
// Dispatch
// ============================================================

/**
 * "Meus torneios" nunca vaza pra outro usuário porque o filtro usa sempre
 * ctx.userId (vem do JWT da sessão), nunca um id que o modelo mandou nos
 * argumentos — o modelo não tem como pedir dado de outra pessoa.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'contar_torneios_por_estado': {
      const estado = typeof args.estado === 'string' ? args.estado.trim().toUpperCase().slice(0, 2) : '';
      if (!estado) return { error: 'Estado não informado.' };
      const { count, error } = await ctx.supabase
        .from('tournaments')
        .select('id', { count: 'exact', head: true })
        .eq('state', estado)
        .eq('is_public', true)
        .neq('status', 'draft');
      if (error) return { error: error.message };
      return { estado, count: count ?? 0 };
    }
    case 'contar_meus_torneios': {
      if (!ctx.userId) {
        return { erro: 'login_necessario', mensagem: 'Só consigo contar os SEUS torneios se você estiver logado.' };
      }
      const { count, error } = await ctx.supabase
        .from('tournaments')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', ctx.userId);
      if (error) return { error: error.message };
      return { count: count ?? 0 };
    }
    case 'listar_torneios':
      return toolListarTorneios(args, ctx);
    case 'estado_do_torneio':
      return toolEstadoDoTorneio(args, ctx);
    case 'classificacao_do_torneio':
      return toolClassificacaoDoTorneio(args, ctx);
    case 'pareamentos_da_rodada':
      return toolPareamentosDaRodada(args, ctx);
    case 'historico_do_participante':
      return toolHistoricoDoParticipante(args, ctx);
    case 'registrar_pergunta_sem_resposta': {
      const { error } = await ctx.admin.from('unanswered_questions').insert({
        session_id: ctx.sessionId,
        user_id: ctx.userId,
        question: ctx.originalQuestion.slice(0, 2000),
      });
      if (error) return { error: error.message };
      return { ok: true };
    }
    default:
      return { error: `Ferramenta desconhecida: ${name}` };
  }
}
