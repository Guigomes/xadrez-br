import { cbxProfileUrl, fideProfileUrl } from '@/lib/utils/player-links';

const LINK_CLASS = 'text-brand-600 underline underline-offset-2 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300';

/**
 * "CBX 123 · FIDE 456" com cada ID levando ao perfil do jogador na entidade
 * (abre em outra aba). Devolve só os IDs que existem; sem nenhum, não renderiza.
 */
export function ExternalIdLinks({
  cbxId,
  fideId,
  className,
}: {
  cbxId?: string | number | null;
  fideId?: string | number | null;
  className?: string;
}) {
  if (!cbxId && !fideId) return null;
  return (
    <span className={className}>
      {cbxId && (
        <a href={cbxProfileUrl(cbxId)} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          CBX {cbxId}
        </a>
      )}
      {cbxId && fideId && ' · '}
      {fideId && (
        <a href={fideProfileUrl(fideId)} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          FIDE {fideId}
        </a>
      )}
    </span>
  );
}
