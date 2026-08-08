/**
 * Passos do tour guiado de criação de torneio.
 *
 * O tour atravessa seis rotas e NÃO navega sozinho — quem navega é o
 * organizador (clica "Novo torneio", submete o formulário, clica numa aba).
 * Cada rota tem seu bloco de passos; quando o bloco acaba, o progresso é
 * gravado e o tour se cala até o componente remontar na rota seguinte. Isso
 * evita duplicar aqui as regras de navegação que já existem nas páginas —
 * notavelmente o `router.push` de app/admin/tournaments/new/page.tsx.
 *
 * Os alvos são atributos `data-tour` explícitos. Ancorar por classe ou por
 * texto quebraria no primeiro ajuste de layout.
 */

export type TourRoute = 'admin' | 'new' | 'edit' | 'groups' | 'registrations' | 'players';

export interface TourStep {
  id: string;
  route: TourRoute;
  /**
   * Valor do atributo data-tour do elemento a destacar. Ausente = passo sem
   * alvo — driver.js mostra o popover sozinho, centralizado, sem recorte no
   * overlay. É o caso da tela de boas-vindas, que não aponta pra nada.
   */
  target?: string;
  title: string;
  body: string;
  /**
   * Alvo com render condicional: se não existir no DOM, o passo é pulado em vez
   * de travar o tour.
   */
  optional?: boolean;
  /** Sobrescreve o texto padrão ("Próximo") só neste passo. */
  nextBtnText?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'boas-vindas',
    route: 'admin',
    title: 'Bem-vindo! 👋',
    body:
      'Vou te acompanhar pelas três etapas de criar um torneio: os dados do torneio, ' +
      'as classificações e, por fim, os participantes. Leva menos de 5 minutos.',
    nextBtnText: 'Começar',
  },
  {
    id: 'novo-torneio',
    route: 'admin',
    target: 'novo-torneio',
    title: 'Tudo começa aqui',
    body: 'Este botão cria um torneio do zero.',
  },

  {
    id: 'info-basica',
    route: 'new',
    target: 'info-basica',
    title: 'Informações básicas',
    body:
      'Nome, cidade e local aparecem na página pública do torneio — é por eles que os ' +
      'jogadores vão te encontrar. A descrição aceita texto livre: regulamento, premiação, o que quiser.',
  },
  {
    id: 'organizacao',
    route: 'new',
    target: 'organizacao',
    title: 'Quem responde pelo torneio',
    body:
      'Organizador aparece na página pública, pra quem tiver dúvida saber a quem recorrer. ' +
      'Árbitro-chefe é opcional — preencha se já tiver definido.',
  },
  {
    id: 'formato',
    route: 'new',
    target: 'formato',
    title: 'Formato do torneio',
    body:
      'Sistema, número de rodadas e ritmo de jogo. Aqui também ficam as datas e o período ' +
      'de inscrição — fora dele o formulário público fecha sozinho.',
  },
  {
    id: 'pergunta-gratuita',
    route: 'new',
    target: 'pergunta-gratuita',
    title: 'Cobrança',
    body:
      'Responda "Não" se cobrar inscrição — aparecem os campos de valor e se o comprovante de ' +
      'pagamento é obrigatório pra aprovar. Sem comprovante, você aprova só de olho no que o ' +
      'jogador declarou.',
  },
  {
    id: 'gerenciamento',
    route: 'new',
    target: 'gerenciamento',
    title: 'Ranking e desempate',
    body:
      'O rating escolhido aqui ordena o ranking inicial, que é o que gera os pareamentos. ' +
      'A ordem de desempate decide quem fica na frente quando dois jogadores terminam com os ' +
      'mesmos pontos — na dúvida, deixe o padrão. Clique em "Dúvidas sobre o desempate?" pra ' +
      'entender cada critério.',
  },
  {
    id: 'visibilidade',
    route: 'new',
    target: 'visibilidade',
    title: 'Quem pode ver',
    body:
      'Torneio público aparece na lista do site. Desmarcado, ele só é acessível por quem tiver ' +
      'o link direto — útil enquanto você ainda está montando tudo.',
  },
  // Bloco de Classificação: mora em 'new' porque é ali que as perguntas
  // aparecem hoje (as mesmas âncoras data-tour existem em
  // app/admin/tournaments/new/page.tsx). Ficou marcado como 'edit' de quando
  // classificação só era editável depois de criar — e como criar pousa direto
  // em /groups, o organizador nunca passava por /edit e o tour pulava a
  // explicação inteira. A tela /edit segue tendo as mesmas seções pra quem
  // volta ajustar depois; só o tour é que não passa mais por lá.
  {
    id: 'intro-classificacao',
    route: 'new',
    target: 'secao-classificacao',
    title: 'Duas coisas diferentes',
    body:
      'Classificação é quem disputa prêmio com quem — Sub-12, Feminino, e por aí. ' +
      'Emparceiramento é quem joga contra quem no tabuleiro. Dá para ter uma sem a outra: ' +
      'todo mundo joga junto e a premiação sai separada.',
  },
  {
    id: 'pergunta-idade',
    route: 'new',
    target: 'pergunta-idade',
    title: 'Separar por idade?',
    body:
      'Marque as faixas do seu regulamento. Sub-12 quer dizer "até 12 anos", pela convenção da ' +
      'CBX: o ano do torneio menos o ano de nascimento. Quem se encaixa em mais de uma faixa ' +
      'entra sempre na menor.',
  },
  {
    id: 'pergunta-rating',
    route: 'new',
    target: 'pergunta-rating',
    title: 'Separar por rating?',
    body:
      'Atenção: o formulário de inscrição não pede rating. Se usar esta divisão, você vai ' +
      'precisar preencher o rating na aba Participantes — senão ninguém cai nessas faixas.',
  },
  {
    id: 'pergunta-feminina',
    route: 'new',
    target: 'pergunta-feminina',
    title: 'Classificação feminina?',
    body:
      'Ela se combina com as outras. Marcando idade e feminina, uma jogadora de 15 anos entra ' +
      'em "Sub-17 Feminino" — só nela, mais o geral. Cada pessoa fica em exatamente uma ' +
      'classificação.',
  },
  {
    id: 'gerar',
    route: 'new',
    target: 'gerar-classificacoes',
    optional: true,
    title: 'Confira antes de salvar',
    body:
      'Esta é a lista que será criada junto com o torneio, a partir do que você marcou. Cada ' +
      'participante é classificado automaticamente pelos dados dele — ano de nascimento, ' +
      'rating e sexo.',
  },
  {
    id: 'criar',
    route: 'new',
    target: 'criar',
    title: 'Última etapa',
    body:
      'Marque as classificações que o torneio vai premiar — cada participante cai na faixa ' +
      'certa sozinho. Aqui embaixo, clique pra criar o torneio; o emparceiramento (quem joga ' +
      'contra quem) você define depois, na aba própria.',
  },

  {
    id: 'emparceiramento',
    route: 'groups',
    target: 'secao-emparceiramento',
    title: 'Quem joga contra quem',
    body:
      '"Todos juntos" faz um torneio só. Dividindo por idade ou rating, cada faixa vira um ' +
      'torneio separado, com rodadas próprias. A escolha só vale depois de clicar em ' +
      '"Salvar emparceiramento".',
  },

  {
    id: 'link-inscricao',
    route: 'registrations',
    target: 'link-inscricao',
    title: 'Agora falta gente',
    body:
      'Copie este link e mande para os jogadores — eles se inscrevem sozinhos e a inscrição ' +
      'aparece aqui embaixo pra você aprovar.',
  },
  {
    id: 'cadastrar',
    route: 'players',
    target: 'cadastrar-participante',
    title: 'Ou cadastre você mesmo',
    body:
      'Use "Cadastrar participante" pra adicionar à mão quem não vai usar o link. Com gente ' +
      'no torneio, a aba Rodadas libera o pareamento. É isso — bom torneio!',
  },
];

/** Rota do tour correspondente ao pathname, ou null se estamos fora do fluxo. */
export function matchRoute(pathname: string): TourRoute | null {
  if (/^\/admin\/?$/.test(pathname)) return 'admin';
  if (/^\/admin\/tournaments\/new\/?$/.test(pathname)) return 'new';
  if (/^\/admin\/tournaments\/[^/]+\/edit\/?$/.test(pathname)) return 'edit';
  if (/^\/admin\/tournaments\/[^/]+\/groups\/?$/.test(pathname)) return 'groups';
  if (/^\/admin\/tournaments\/[^/]+\/registrations\/?$/.test(pathname)) return 'registrations';
  if (/^\/admin\/tournaments\/[^/]+\/players\/?$/.test(pathname)) return 'players';
  return null;
}

/**
 * Passos a exibir numa rota, a partir do progresso salvo.
 *
 * `fromId` é o passo em que o tour parou. Se ele pertence a esta rota, o bloco
 * começa nele; se pertence a uma rota anterior (o organizador ainda não chegou
 * aqui) ou é desconhecido, não há nada a exibir — o tour só avança para frente.
 *
 * Sem `fromId`, a resposta é sempre vazia — mesmo na rota 'admin'. Decidir se
 * o tour começa do zero é trabalho do TourLauncher (só ele sabe se é a
 * primeira vez e se já foi dispensado); aqui teria que arriscar mostrar o
 * tour pra qualquer visita com sessionStorage vazio — o caso comum, já que
 * sessionStorage some ao fechar a aba. TourLauncher grava o primeiro passo
 * ANTES de disparar o evento de início, então por essa função nunca vê
 * `fromId` nulo numa partida legítima.
 */
export function stepsForRoute(route: TourRoute, fromId: string | null): TourStep[] {
  const block = TOUR_STEPS.filter((s) => s.route === route);
  if (!block.length || !fromId) return [];

  const start = block.findIndex((s) => s.id === fromId);
  if (start >= 0) return block.slice(start);

  // fromId não é desta rota: só mostra o bloco se o progresso ficou para trás.
  const fromIndex = TOUR_STEPS.findIndex((s) => s.id === fromId);
  if (fromIndex < 0) return [];
  const blockStart = TOUR_STEPS.findIndex((s) => s.id === block[0].id);
  return fromIndex < blockStart ? block : [];
}

/** Passo seguinte no tour inteiro (atravessa rotas), ou null se acabou. */
export function nextStepAfter(stepId: string): TourStep | null {
  const i = TOUR_STEPS.findIndex((s) => s.id === stepId);
  if (i < 0 || i === TOUR_STEPS.length - 1) return null;
  return TOUR_STEPS[i + 1];
}
