import { cn } from '@/lib/utils/cn';
import { StateBadge } from '@/components/player/state-badge';
import { federationName } from '@/lib/utils/federation';

export function FederationBadge({ federation, className }: { federation: string | null | undefined; className?: string }) {
  if (!federation) return null;
  const code = federation.toUpperCase();
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800',
        className,
      )}
      title={`País: ${federationName(code)}`}
    >
      {code}
    </span>
  );
}

/**
 * De onde o jogador é. Torneio internacional: o país (federação FIDE) de todos.
 * Torneio no Brasil: a UF, como sempre, e o país só para quem é de fora (a UF de
 * um estrangeiro não existe, e antes ele ficava sem identificação nenhuma).
 */
export function OriginBadge({
  state,
  federation,
  international,
  className,
}: {
  state: string | null | undefined;
  federation: string | null | undefined;
  international: boolean;
  className?: string;
}) {
  if (international) return <FederationBadge federation={federation} className={className} />;
  const foreign = !!federation && federation.toUpperCase() !== 'BRA';
  return (
    <>
      {!foreign && <StateBadge state={state} className={className} />}
      {foreign && <FederationBadge federation={federation} className={className} />}
    </>
  );
}
