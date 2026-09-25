import { format, parseISO, formatDistanceToNow, isAfter, isBefore } from 'date-fns';
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

export function todayInBrazil(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** Mensagem curta e estável para o período anterior ao torneio. Datas no
 * formato ISO são convertidas em UTC para a diferença não variar com o fuso
 * horário do servidor. */
export function getTournamentStartLabel(startDate: string, today = todayInBrazil()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;

  const start = Date.parse(`${startDate}T00:00:00Z`);
  const current = Date.parse(`${today}T00:00:00Z`);
  const days = Math.round((start - current) / 86_400_000);

  if (days < 0) return null;
  if (days === 0) return 'Começa hoje';
  if (days === 1) return 'Começa amanhã';
  return `Começa em ${days} dias`;
}
