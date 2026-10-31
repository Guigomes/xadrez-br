import Image from 'next/image';
import { tournamentLogo } from '@/lib/tournament/branding';

/** Event-specific artwork never replaces the Gambito logo or changes other events. */
export function TournamentLogo({ tournamentId, variant = 'header' }: {
  tournamentId: string; variant?: 'header' | 'tv';
}) {
  const logo = tournamentLogo(tournamentId);
  if (!logo) return null;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-white p-1 shadow-sm ring-1 ring-black/10 ${variant === 'tv' ? 'h-16 w-16 sm:h-24 sm:w-24' : 'h-12 w-12 sm:h-16 sm:w-16'}`}>
      <Image src={logo.src} alt={logo.alt} width={128} height={128}
        sizes={variant === 'tv' ? '(min-width: 640px) 96px, 64px' : '(min-width: 640px) 64px, 48px'}
        className="h-full w-full object-contain" />
    </span>
  );
}
