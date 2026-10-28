import { describe, expect, it } from 'vitest';
import { localizedTitle } from '../player-title';

describe('localizedTitle', () => {
  it('Mestre Nacional vira MN em português e fica NM nos outros idiomas', () => {
    expect(localizedTitle('NM', 'pt-BR')).toBe('MN');
    expect(localizedTitle('NM', 'en')).toBe('NM');
    expect(localizedTitle('NM', 'es')).toBe('NM');
  });
  it('outros títulos não mudam', () => {
    for (const t of ['GM', 'IM', 'FM', 'CM', 'WNM', 'CNM', 'WCNM', 'AFM']) {
      expect(localizedTitle(t, 'pt-BR')).toBe(t);
      expect(localizedTitle(t, 'en')).toBe(t);
    }
  });
  it('sem título devolve null', () => {
    expect(localizedTitle(null, 'pt-BR')).toBeNull();
    expect(localizedTitle(undefined, 'en')).toBeNull();
    expect(localizedTitle('', 'pt-BR')).toBeNull();
  });
});
