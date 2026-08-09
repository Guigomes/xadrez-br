import { describe, it, expect } from 'vitest';
import { resolveLocale, primaryLanguage, SPANISH_COUNTRIES } from '../detect';

describe('primaryLanguage', () => {
  it('extrai o idioma base do primeiro tag', () => {
    expect(primaryLanguage('pt-BR,pt;q=0.9,en;q=0.8')).toBe('pt');
    expect(primaryLanguage('es-AR,es;q=0.9')).toBe('es');
    expect(primaryLanguage('en-US')).toBe('en');
  });
  it('é case-insensitive e tolera espaços', () => {
    expect(primaryLanguage(' ES-es , en')).toBe('es');
  });
  it('null/vazio devolve null', () => {
    expect(primaryLanguage(null)).toBeNull();
    expect(primaryLanguage('')).toBeNull();
    expect(primaryLanguage(undefined)).toBeNull();
  });
});

describe('resolveLocale — geo tem prioridade', () => {
  it('BR sempre pt-BR, mesmo com Accept-Language estrangeiro', () => {
    expect(resolveLocale('BR', 'en-US,en')).toBe('pt-BR');
    expect(resolveLocale('br', 'es-AR')).toBe('pt-BR');
  });
  it('país hispanofalante vira es, mesmo com Accept-Language em inglês', () => {
    expect(resolveLocale('AR', 'en-US')).toBe('es');
    expect(resolveLocale('MX', null)).toBe('es');
    expect(resolveLocale('ES', 'pt-BR')).toBe('es');
  });
  it('país conhecido não-hispano/não-BR vira en, ignorando Accept-Language', () => {
    // Refinamento "hispano nos EUA -> es" é melhoria futura (§1.4): geo puro manda.
    expect(resolveLocale('US', 'es-US,es')).toBe('en');
    expect(resolveLocale('FR', 'fr-FR')).toBe('en');
    expect(resolveLocale('DE', null)).toBe('en');
  });
});

describe('resolveLocale — sem geo cai no Accept-Language', () => {
  it('pt -> pt-BR, es -> es, en -> en', () => {
    expect(resolveLocale(null, 'pt-BR,pt')).toBe('pt-BR');
    expect(resolveLocale(null, 'es-AR,es')).toBe('es');
    expect(resolveLocale(null, 'en-GB,en')).toBe('en');
    expect(resolveLocale(undefined, 'es')).toBe('es');
  });
  it('idioma desconhecido ou nada cai no default pt-BR', () => {
    expect(resolveLocale(null, 'fr-FR,fr')).toBe('pt-BR');
    expect(resolveLocale(null, null)).toBe('pt-BR');
    expect(resolveLocale('', '')).toBe('pt-BR');
  });
});

describe('SPANISH_COUNTRIES', () => {
  it('inclui os grandes vizinhos do Cone Sul e México/Espanha', () => {
    for (const cc of ['AR', 'PY', 'UY', 'CL', 'BO', 'PE', 'CO', 'MX', 'ES']) {
      expect(SPANISH_COUNTRIES.has(cc)).toBe(true);
    }
  });
  it('NÃO inclui EUA, Brasil, Portugal (por decisão, não esquecimento)', () => {
    for (const cc of ['US', 'BR', 'PT', 'BZ']) {
      expect(SPANISH_COUNTRIES.has(cc)).toBe(false);
    }
  });
});
