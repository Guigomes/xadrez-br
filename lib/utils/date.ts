import { format, parseISO, formatDistanceToNow, isAfter, isBefore, isToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function formatDate(date: string | Date, pattern = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, pattern, { locale: ptBR });
}

export function formatDateRange(start: string, end: string | null): string {
  if (!end || start === end) return formatDate(start, "dd 'de' MMM 'de' yyyy");
  const s = parseISO(start);
  const e = parseISO(end);
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${format(s, 'dd', { locale: ptBR })} a ${format(e, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}`;
  }
  return `${formatDate(start, "dd/MM/yyyy")} – ${formatDate(end, "dd/MM/yyyy")}`;
}

export function timeAgo(date: string): string {
  return formatDistanceToNow(parseISO(date), { locale: ptBR, addSuffix: true });
}

export function isTournamentActive(startDate: string, endDate: string | null): boolean {
  const start = parseISO(startDate);
  const end = endDate ? parseISO(endDate) : start;
  const now = new Date();
  return !isAfter(start, now) && !isBefore(end, now);
}
