import { formatScore } from '@/lib/utils/chess';

/** Current tournament totals, not the score awarded by this individual game. */
export function PlayerScoreSummary({ rating, score, className = 'text-xs text-gray-500 dark:text-gray-400' }: {
  rating: number | null | undefined;
  score: number | null | undefined;
  className?: string;
}) {
  const points = score == null ? 'Pontos —' : `${score === 0.5 ? '½' : formatScore(score)} ${score === 1 ? 'pt' : 'pts'}`;
  return (
    <p data-player-score aria-label="Rating e pontuação acumulada" className={`mt-0.5 tabular-nums ${className}`}>
      {rating != null && rating > 0 ? `Rating ${rating}` : 'Sem rating'} · {points}
    </p>
  );
}
