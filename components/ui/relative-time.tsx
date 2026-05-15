'use client';

interface Props {
  iso: string;
  className?: string;
}

/** Renders a human-readable relative time string ("há 5 minutos", "há 2 horas") */
export function RelativeTime({ iso, className }: Props) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  let label: string;
  if (diffMin < 1)       label = 'agora mesmo';
  else if (diffMin < 60) label = `há ${diffMin} min`;
  else if (diffMin < 120) label = 'há 1 hora';
  else if (diffMin < 1440) label = `há ${Math.floor(diffMin / 60)} horas`;
  else if (diffMin < 2880) label = 'há 1 dia';
  else                   label = `há ${Math.floor(diffMin / 1440)} dias`;

  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString('pt-BR')} className={className}>
      {label}
    </time>
  );
}
