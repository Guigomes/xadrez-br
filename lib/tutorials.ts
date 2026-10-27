/**
 * Série de vídeos de tutorial do organizador. Os arquivos ficam no bucket privado `tutorials`
 * (migration 20261027120000); a ordem e os títulos vêm daqui. Arquivo no bucket sem entrada
 * nesta lista aparece no fim, com o nome do arquivo.
 */
export interface TutorialEpisode {
  file: string;
  title: string;
  summary: string;
}

export const TUTORIAL_BUCKET = 'tutorials';

export const TUTORIAL_EPISODES: TutorialEpisode[] = [
  {
    file: 'ep1-criar-torneio.mp4',
    title: '1. Criar seu primeiro torneio',
    summary: 'Novo torneio, campos obrigatórios, cobrança, faixas de idade, rascunho, emparceiramento e publicar.',
  },
  {
    file: 'ep2-inscricoes.mp4',
    title: '2. Inscrições',
    summary: 'Abrir inscrições, link para os jogadores, aprovar ou rejeitar, cadastro manual e encerramento.',
  },
  {
    file: 'ep3-rodadas-resultados.mp4',
    title: '3. Rodadas e resultados',
    summary: 'Iniciar o torneio, gerar e publicar a rodada, lançar e corrigir resultados, árbitros.',
  },
  {
    file: 'ep4-classificacao-encerramento.mp4',
    title: '4. Classificação e encerramento',
    summary: 'Categorias, desempates, impressão, encerramento automático e relatório.',
  },
];

/** Junta os arquivos do bucket com a lista da série: só o que existe, na ordem da série. */
export function orderTutorials(files: string[]): TutorialEpisode[] {
  const known = TUTORIAL_EPISODES.filter((e) => files.includes(e.file));
  const extra = files
    .filter((f) => f.endsWith('.mp4') && !TUTORIAL_EPISODES.some((e) => e.file === f))
    .sort()
    .map((f) => ({ file: f, title: f.replace(/\.mp4$/, ''), summary: '' }));
  return [...known, ...extra];
}
