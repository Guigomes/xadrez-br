import { describe, expect, it } from 'vitest';
import { relativeTimeLabel } from '../../components/ui/relative-time';

describe('relativeTimeLabel', () => {
  const iso = '2026-11-05T19:30:45.000Z';
  const at = (min: number) => new Date(iso).getTime() + min * 60_000;

  it('formata minutos, horas e dias', () => {
    expect(relativeTimeLabel(iso, at(0.5))).toBe('agora mesmo');
    expect(relativeTimeLabel(iso, at(9))).toBe('há 9 min');
    expect(relativeTimeLabel(iso, at(90))).toBe('há 1 hora');
    expect(relativeTimeLabel(iso, at(180))).toBe('há 3 horas');
    expect(relativeTimeLabel(iso, at(1500))).toBe('há 1 dia');
    expect(relativeTimeLabel(iso, at(4400))).toBe('há 3 dias');
  });

  it('muda na virada do minuto (por isso o servidor e o navegador podem divergir)', () => {
    expect(relativeTimeLabel(iso, at(9.99))).not.toBe(relativeTimeLabel(iso, at(10)));
  });
});
