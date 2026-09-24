import { describe, it, expect } from 'vitest';
import { stripLocale, getLocalePrefix } from '../routing';

describe('stripLocale', () => {
  it('remove o prefixo de locale quando presente', () => {
    expect(stripLocale('/en/admin')).toBe('/admin');
    expect(stripLocale('/es/torneios/xyz')).toBe('/torneios/xyz');
  });
  it('locale sozinho vira raiz', () => {
    expect(stripLocale('/en')).toBe('/');
    expect(stripLocale('/es')).toBe('/');
  });
  it('sem prefixo, devolve igual (pt-BR é o default sem prefixo)', () => {
    expect(stripLocale('/admin')).toBe('/admin');
    expect(stripLocale('/')).toBe('/');
  });
  it('não confunde segmento que só começa igual a um locale', () => {
    expect(stripLocale('/environment')).toBe('/environment');
    expect(stripLocale('/estudos')).toBe('/estudos');
  });
});

describe('getLocalePrefix', () => {
  it('devolve o prefixo com barra quando presente', () => {
    expect(getLocalePrefix('/en/admin')).toBe('/en');
    expect(getLocalePrefix('/es/torneios/xyz')).toBe('/es');
  });
  it('locale sozinho também devolve o prefixo (não a raiz)', () => {
    // Regressão: pathname.length - stripLocale(pathname).length quebra aqui
    // porque stripLocale('/en') é '/' (1 char), não '' — um redirect que
    // fizesse `pathname.slice(0, pathname.length - bare.length)` cortava
    // "/en" em "/e". getLocalePrefix não depende dessa subtração.
    expect(getLocalePrefix('/en')).toBe('/en');
    expect(getLocalePrefix('/es')).toBe('/es');
  });
  it('sem prefixo (pt-BR) devolve string vazia', () => {
    expect(getLocalePrefix('/admin')).toBe('');
    expect(getLocalePrefix('/')).toBe('');
  });
  it('não confunde segmento que só começa igual a um locale', () => {
    expect(getLocalePrefix('/environment')).toBe('');
    expect(getLocalePrefix('/estudos')).toBe('');
  });
});
