/**
 * URLs em português (pedido do dono, 2026-10-28): as rotas de página que tinham
 * segmento em inglês (`/torneios/x/rounds`, `/admin/tournaments/x/players`...)
 * foram renomeadas. Links antigos continuam funcionando: o middleware chama
 * `toPortuguesePath` com o caminho SEM prefixo de locale e, se voltar algo
 * diferente, redireciona (308) para o novo — links compartilhados, QR codes,
 * notificações já enviadas, favoritos.
 *
 * Mapeamento por posição do segmento, não por troca de palavra solta: um slug de
 * torneio/série pode conter "rounds" ou "players", e só o segmento na posição de
 * rota é trocado. `/api/...` nunca passa por aqui (o matcher do middleware exclui).
 */

const TOP: Record<string, string> = {
  account: 'conta',
  players: 'jogadores',
  login: 'entrar',
};

const TOURNAMENT_TAB: Record<string, string> = {
  rounds: 'rodadas',
  standings: 'classificacao',
  register: 'inscricao',
  participants: 'participantes',
  statistics: 'estatisticas',
  players: 'jogadores',
};

const ADMIN_TOURNAMENT_TAB: Record<string, string> = {
  edit: 'editar',
  groups: 'emparceiramento',
  history: 'historico',
  imports: 'importacoes',
  players: 'jogadores',
  registrations: 'inscricoes',
  report: 'relatorio',
  rounds: 'rodadas',
  standings: 'classificacao',
  staff: 'equipe',
};

const ADMIN_DEV: Record<string, string> = {
  accesses: 'acessos',
  errors: 'erros',
  plans: 'planos',
  unanswered: 'sem-resposta',
};

/** Caminho (sem locale, com `/` inicial) com os segmentos antigos em inglês trocados. */
export function toPortuguesePath(pathname: string): string {
  const s = pathname.split('/'); // s[0] === '' (caminho começa com '/')
  const map = (i: number, table: Record<string, string>) => {
    if (s[i] !== undefined && Object.prototype.hasOwnProperty.call(table, s[i])) s[i] = table[s[i]];
  };

  if (s[1] === 'torneios' && s.length > 3) {
    const tab = s[3];
    map(3, TOURNAMENT_TAB);
    // /torneios/x/rounds/3/print e /torneios/x/standings/print
    if (tab === 'rounds' && s[5] === 'print') s[5] = 'imprimir';
    if (tab === 'standings' && s[4] === 'print') s[4] = 'imprimir';
  } else if (s[1] === 'admin') {
    if (s[2] === 'tournaments') {
      s[2] = 'torneios';
      if (s[3] === 'new') {
        s[3] = 'novo';
        if (s[4] === 'from-chess-results') s[4] = 'do-chess-results';
      } else if (s.length > 4) {
        const tab = s[4];
        map(4, ADMIN_TOURNAMENT_TAB);
        // /admin/tournaments/x/rounds/<id>/results
        if (tab === 'rounds' && s[6] === 'results') s[6] = 'resultados';
      }
    } else if (s[2] === 'dev') {
      map(3, ADMIN_DEV);
    } else if (s[2] === 'stats') {
      s[2] = 'estatisticas';
    } else if (s[2] === 'series') {
      if (s[3] === 'new') s[3] = 'nova';
      else if (s[4] === 'edit') s[4] = 'editar';
    }
  } else {
    map(1, TOP);
  }
  return s.join('/');
}
