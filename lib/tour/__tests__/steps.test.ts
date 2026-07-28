import { describe, it, expect } from 'vitest';
// Import relativo (não '@/...') de propósito: vitest não tem o alias '@/'
// configurado — mesma restrição já anotada em lib/utils/classification-match.ts.
import { TOUR_STEPS, matchRoute, stepsForRoute, nextStepAfter } from '../steps';
import { readProgress, isDismissed, shouldAutoStart } from '../state';

describe('matchRoute', () => {
  it('reconhece as quatro rotas do fluxo', () => {
    expect(matchRoute('/admin')).toBe('admin');
    expect(matchRoute('/admin/tournaments/new')).toBe('new');
    expect(matchRoute('/admin/tournaments/aberto-sp-20260315/groups')).toBe('groups');
    expect(matchRoute('/admin/tournaments/aberto-sp-20260315/players')).toBe('players');
  });

  it('tolera barra final', () => {
    expect(matchRoute('/admin/')).toBe('admin');
    expect(matchRoute('/admin/tournaments/new/')).toBe('new');
  });

  it('NÃO casa com /edit — é o mesmo TournamentForm, com os mesmos data-tour', () => {
    expect(matchRoute('/admin/tournaments/aberto-sp-20260315/edit')).toBeNull();
  });

  it('ignora o resto do admin e o site público', () => {
    expect(matchRoute('/admin/tournaments/x/rounds')).toBeNull();
    expect(matchRoute('/admin/tournaments/x/registrations')).toBeNull();
    expect(matchRoute('/admin/stats')).toBeNull();
    expect(matchRoute('/tournaments/x/players')).toBeNull();
    expect(matchRoute('/')).toBeNull();
  });
});

describe('stepsForRoute', () => {
  it('sem progresso, não mostra nada em rota nenhuma — nem em admin', () => {
    // Decidir se o tour começa do zero é do TourLauncher (só ele sabe se é
    // primeira vez / se já foi dispensado). Sem fromId explícito, essa função
    // não tem como saber — teria que arriscar mostrar pra qualquer aba nova
    // (sessionStorage some ao fechar), que é o caso comum, não a exceção.
    expect(stepsForRoute('admin', null)).toEqual([]);
    expect(stepsForRoute('new', null)).toEqual([]);
  });

  it('retoma no passo salvo quando ele é da própria rota', () => {
    expect(stepsForRoute('new', 'gerenciamento').map((s) => s.id)).toEqual([
      'gerenciamento',
      'visibilidade',
      'criar',
    ]);
  });

  it('mostra o bloco quando o progresso ficou numa rota anterior', () => {
    // Organizador parou em "criar" (rota new) e o redirect o levou a /groups.
    expect(stepsForRoute('groups', 'criar')[0].id).toBe('intro-classificacao');
  });

  it('não volta atrás: progresso adiante da rota atual não reabre o bloco', () => {
    // Já está em /players; voltar para /groups não deve reiniciar o tour lá.
    expect(stepsForRoute('groups', 'link-inscricao')).toEqual([]);
    expect(stepsForRoute('new', 'intro-classificacao')).toEqual([]);
  });

  it('progresso desconhecido não exibe nada', () => {
    expect(stepsForRoute('new', 'passo-que-nao-existe')).toEqual([]);
  });
});

describe('nextStepAfter', () => {
  it('atravessa a fronteira entre rotas', () => {
    expect(nextStepAfter('criar')?.id).toBe('intro-classificacao');
    expect(nextStepAfter('emparceiramento')?.id).toBe('link-inscricao');
  });

  it('devolve null no último passo do tour', () => {
    expect(nextStepAfter('cadastrar')).toBeNull();
  });

  it('devolve null para id inexistente', () => {
    expect(nextStepAfter('nada')).toBeNull();
  });
});

describe('integridade do registro', () => {
  it('não tem ids duplicados', () => {
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('agrupa os passos por rota, na ordem do fluxo', () => {
    // stepsForRoute usa fatias contíguas — passos de uma rota intercalados com
    // os de outra quebrariam a retomada silenciosamente.
    const ordem = TOUR_STEPS.map((s) => s.route);
    const primeiraOcorrencia = ordem.filter((r, i) => ordem.indexOf(r) === i);
    expect(primeiraOcorrencia).toEqual(['admin', 'new', 'groups', 'players']);
    expect(ordem).toEqual(primeiraOcorrencia.flatMap((r) => ordem.filter((x) => x === r)));
  });

  it('só o passo de render condicional é opcional', () => {
    expect(TOUR_STEPS.filter((s) => s.optional).map((s) => s.id)).toEqual(['gerar']);
  });

  it('o passo de boas-vindas não tem alvo e sobrescreve o texto do botão', () => {
    // Sem target, driver.js mostra o popover sozinho, sem recorte no overlay —
    // é o que faz a tela de boas-vindas não apontar pra nada.
    expect(TOUR_STEPS[0].id).toBe('boas-vindas');
    expect(TOUR_STEPS[0].target).toBeUndefined();
    expect(TOUR_STEPS[0].nextBtnText).toBe('Começar');
  });

  it('só o passo de boas-vindas sobrescreve o texto do botão', () => {
    expect(TOUR_STEPS.filter((s) => s.nextBtnText).map((s) => s.id)).toEqual(['boas-vindas']);
  });
});

describe('state fora do navegador', () => {
  // O layout do admin é server component: state.ts roda no servidor antes de
  // hidratar. Precisa degradar em silêncio, não lançar.
  it('degrada sem window em vez de quebrar o render', () => {
    expect(readProgress()).toBeNull();
    expect(isDismissed()).toBe(false);
    expect(shouldAutoStart(true)).toBe(true);
    expect(shouldAutoStart(false)).toBe(false);
  });
});
