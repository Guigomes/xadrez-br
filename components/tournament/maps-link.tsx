import { mapsDirectionsUrl } from '@/lib/utils/maps';

/** Botão "Como chegar": abre o Google Maps com a rota até o local do torneio. */
export function MapsLink({
  venue,
  city,
  state,
  className,
}: {
  venue: string;
  city?: string | null;
  state?: string | null;
  className?: string;
}) {
  return (
    <a
      href={mapsDirectionsUrl(venue, city, state)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Como chegar ao local no Google Maps"
      title="Abrir rota no Google Maps"
      className={`inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-300 dark:hover:bg-brand-900/40 ${className ?? ''}`}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
      Como chegar
    </a>
  );
}
