/**
 * Persistência do tour de criação de torneio.
 *
 * Dois armazenamentos com prazos de validade diferentes de propósito:
 *
 * - progresso em `sessionStorage` — é o "onde eu parei" de uma jornada em
 *   andamento. Se o organizador fecha o navegador no meio, retomar no passo 7
 *   três dias depois não faria sentido nenhum.
 * - dispensa em `localStorage` — é uma preferência ("não quero isso"), e
 *   preferência não expira ao fechar a aba.
 *
 * Mesmo padrão de acesso defensivo de lib/utils/local-follows.ts: guarda de
 * `typeof window` (o layout do admin é renderizado no servidor) e try/catch,
 * porque storage lança em modo privado de alguns navegadores.
 */

const PROGRESS_KEY = 'xbr_tour_criar_torneio';
const DISMISSED_KEY = 'xbr_tour_criar_torneio_dispensado';

/** Id do passo em que o tour parou, ou null se não há tour em andamento. */
export function readProgress(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(PROGRESS_KEY);
  } catch {
    return null;
  }
}

export function writeProgress(stepId: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PROGRESS_KEY, stepId);
  } catch {
    /* storage indisponível — o tour degrada para "só nesta tela" */
  }
}

export function clearProgress() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PROGRESS_KEY);
  } catch {
    /* idem */
  }
}

/** True quando o organizador já pediu para não ver mais o tour. */
export function isDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismiss() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    /* idem */
  }
  clearProgress();
}

/**
 * Deve o tour abrir sozinho? Só para quem nunca criou torneio e nunca
 * dispensou. Um tour já em andamento não é "auto-start" — é retomada, e quem
 * cuida disso é o componente ao montar na rota.
 */
export function shouldAutoStart(firstTime: boolean): boolean {
  return firstTime && !isDismissed() && readProgress() === null;
}

/** Evento que o botão de ajuda dispara para (re)iniciar o tour do zero. */
export const TOUR_START_EVENT = 'xbr:tour:start';
