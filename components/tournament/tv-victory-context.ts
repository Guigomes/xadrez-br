import { createContext } from 'react';

/**
 * Uma mesa avisa aqui quando observa uma vitória nova. A TV decide se a animação pode ser vista:
 * com a rodada na tela, toca na hora; no modo Alternar e na classificação, volta para as mesas
 * (centralizando a mesa) e só então toca; nos outros casos nada é mostrado. Devolve o cancelamento.
 * Sem provedor (testes, uso isolado) toca direto.
 */
export type TvVictoryAnnounce = (card: HTMLElement, play: () => () => void) => () => void;
export const TvVictoryContext = createContext<TvVictoryAnnounce>((_card, play) => play());
