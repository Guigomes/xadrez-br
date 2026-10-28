import { describe, expect, it } from 'vitest';
import { toPortuguesePath } from '../legacy-paths';

describe('toPortuguesePath', () => {
  it.each([
    ['/torneios/aberto-2026/rounds', '/torneios/aberto-2026/rodadas'],
    ['/torneios/aberto-2026/rounds/3', '/torneios/aberto-2026/rodadas/3'],
    ['/torneios/aberto-2026/rounds/3/print', '/torneios/aberto-2026/rodadas/3/imprimir'],
    ['/torneios/aberto-2026/standings', '/torneios/aberto-2026/classificacao'],
    ['/torneios/aberto-2026/standings/print', '/torneios/aberto-2026/classificacao/imprimir'],
    ['/torneios/aberto-2026/register', '/torneios/aberto-2026/inscricao'],
    ['/torneios/aberto-2026/participants', '/torneios/aberto-2026/participantes'],
    ['/torneios/aberto-2026/statistics', '/torneios/aberto-2026/estatisticas'],
    ['/torneios/aberto-2026/players/abc', '/torneios/aberto-2026/jogadores/abc'],
    ['/players', '/jogadores'],
    ['/players/abc', '/jogadores/abc'],
    ['/account', '/conta'],
    ['/login', '/entrar'],
    ['/admin/tournaments/new', '/admin/torneios/novo'],
    ['/admin/tournaments/new/from-chess-results', '/admin/torneios/novo/do-chess-results'],
    ['/admin/tournaments/aberto-2026', '/admin/torneios/aberto-2026'],
    ['/admin/tournaments/aberto-2026/edit', '/admin/torneios/aberto-2026/editar'],
    ['/admin/tournaments/aberto-2026/groups', '/admin/torneios/aberto-2026/emparceiramento'],
    ['/admin/tournaments/aberto-2026/registrations', '/admin/torneios/aberto-2026/inscricoes'],
    ['/admin/tournaments/aberto-2026/rounds/r1/results', '/admin/torneios/aberto-2026/rodadas/r1/resultados'],
    ['/admin/tournaments/aberto-2026/staff', '/admin/torneios/aberto-2026/equipe'],
    ['/admin/dev/unanswered', '/admin/dev/sem-resposta'],
    ['/admin/stats', '/admin/estatisticas'],
    ['/admin/series/new', '/admin/series/nova'],
    ['/admin/series/copa/edit', '/admin/series/copa/editar'],
  ])('%s -> %s', (from, to) => {
    expect(toPortuguesePath(from)).toBe(to);
  });

  it('não mexe em caminho já em português nem em slug com palavra de rota', () => {
    for (const p of ['/', '/torneios', '/torneios/rounds-2026', '/torneios/players-cup/rodadas/2',
      '/admin', '/admin/torneios/x/jogadores', '/admin/dev/chat', '/series/copa/classificacao', '/minha-area']) {
      expect(toPortuguesePath(p)).toBe(p);
    }
  });
});
