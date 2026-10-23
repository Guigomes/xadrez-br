import { describe, expect, it } from 'vitest';
import { parseRegistration, sameRegistration } from '../lite/registration';

const now = new Date('2026-10-22T12:00:00Z');
const base = { name: '  Ana   Souza ', birthYear: '2016', sex: 'w', contact: '(67) 99999-1234', consent: true };

describe('parseRegistration', () => {
  it('normaliza e aceita o mínimo', () => {
    expect(parseRegistration(base, now)).toEqual({
      name: 'Ana Souza',
      birthYear: 2016,
      sex: 'w',
      club: null,
      rating: null,
      guardianName: null,
      contact: '(67) 99999-1234',
    });
  });

  it('aceita e-mail como contato e campos opcionais vazios', () => {
    const r = parseRegistration({ ...base, birthYear: '', sex: 'x', contact: 'mae@exemplo.com', rating: '1450' }, now);
    expect(r).toMatchObject({ birthYear: null, sex: null, contact: 'mae@exemplo.com', rating: 1450 });
  });

  it('recusa sem consentimento, nome curto, contato sem DDD e ano impossível', () => {
    expect(parseRegistration({ ...base, consent: 'true' }, now)).toHaveProperty('error');
    expect(parseRegistration({ ...base, name: 'A' }, now)).toHaveProperty('error');
    expect(parseRegistration({ ...base, contact: '99999-1234' }, now)).toHaveProperty('error');
    expect(parseRegistration({ ...base, birthYear: '2025' }, now)).toHaveProperty('error');
    expect(parseRegistration({ ...base, rating: '12.5' }, now)).toHaveProperty('error');
  });
});

describe('sameRegistration', () => {
  it('ignora acento, caixa e espaços; ano precisa bater', () => {
    expect(sameRegistration({ name: 'JOÃO  Silva', birth_year: 2014 }, { name: 'joao silva', birthYear: 2014 })).toBe(true);
    expect(sameRegistration({ name: 'João Silva', birth_year: 2014 }, { name: 'João Silva', birthYear: 2015 })).toBe(false);
  });
});
