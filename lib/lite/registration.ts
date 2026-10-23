/*
 * Inscrição pelo link de um torneio do app (Gambito Torneios). Validação pura do formulário
 * público — o mesmo texto de erro vai para a tela.
 */

export interface RegistrationInput {
  name: string;
  birthYear: number | null;
  sex: 'm' | 'w' | null;
  club: string | null;
  rating: number | null;
  guardianName: string | null;
  contact: string;
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

/** Valida e normaliza. Devolve a inscrição ou a mensagem de erro. */
export function parseRegistration(raw: unknown, now = new Date()): RegistrationInput | { error: string } {
  const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = clean(b.name, 120);
  if (name.length < 3 || !/\p{L}/u.test(name)) return { error: 'Informe o nome completo do jogador.' };

  const year = now.getFullYear();
  const birthYear = b.birthYear === '' || b.birthYear == null ? null : Number(b.birthYear);
  if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < year - 100 || birthYear > year - 3)) {
    return { error: 'Ano de nascimento inválido.' };
  }
  const sex = b.sex === 'm' || b.sex === 'w' ? b.sex : null;
  const rating = b.rating === '' || b.rating == null ? null : Number(b.rating);
  if (rating !== null && (!Number.isInteger(rating) || rating < 0 || rating > 3500)) return { error: 'Rating inválido.' };

  const contact = clean(b.contact, 120);
  const digits = contact.replace(/\D/g, '');
  const looksEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact);
  if (!looksEmail && (digits.length < 10 || digits.length > 13)) {
    return { error: 'Informe um WhatsApp com DDD (ou um e-mail) para o organizador falar com você.' };
  }
  if (b.consent !== true) return { error: 'É preciso concordar com o uso dos dados para a inscrição.' };

  return {
    name,
    birthYear,
    sex,
    club: clean(b.club, 120) || null,
    rating,
    guardianName: clean(b.guardianName, 120) || null,
    contact,
  };
}

/** Mesma pessoa já inscrita (nome sem acento/caixa + ano de nascimento). */
export function sameRegistration(a: { name: string; birth_year: number | null }, b: { name: string; birthYear: number | null }) {
  const n = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return n(a.name) === n(b.name) && (a.birth_year ?? null) === (b.birthYear ?? null);
}

/** Máximo de inscrições pendentes por torneio (freio contra abuso do formulário público). */
export const MAX_PENDING = 300;
