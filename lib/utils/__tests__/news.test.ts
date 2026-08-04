import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { uniqueNewsSlug, newsScopeLabel, newsCoverUrl, validateCoverFile, MAX_COVER_BYTES } from '../news';

describe('uniqueNewsSlug', () => {
  it('normaliza acentos e espaços do título', () => {
    expect(uniqueNewsSlug('Campeonato Brasileiro de Xadrez 2026', [])).toBe('campeonato-brasileiro-de-xadrez-2026');
  });

  it('sufixa quando o slug base já existe', () => {
    expect(uniqueNewsSlug('Notícia', ['noticia'])).toBe('noticia-2');
  });

  it('pula sufixos já ocupados', () => {
    expect(uniqueNewsSlug('Notícia', ['noticia', 'noticia-2', 'noticia-3'])).toBe('noticia-4');
  });

  it('cai num slug utilizável quando o título só tem símbolos', () => {
    expect(uniqueNewsSlug('!!!', [])).toBe('noticia');
  });
});

describe('newsScopeLabel', () => {
  it('estadual mostra a UF, mais informativa que a palavra "Estadual"', () => {
    expect(newsScopeLabel('state', 'MS')).toBe('MS');
  });

  it('nacional e internacional mostram o nome da abrangência', () => {
    expect(newsScopeLabel('national', null)).toBe('Nacional');
    expect(newsScopeLabel('international', null)).toBe('Internacional');
  });

  it('estadual sem UF não quebra (não deveria acontecer — check no banco)', () => {
    expect(newsScopeLabel('state', null)).toBe('Estadual');
  });
});

describe('newsCoverUrl', () => {
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://exemplo.supabase.co'; });
  afterEach(() => { process.env.NEXT_PUBLIC_SUPABASE_URL = original; });

  it('monta a URL pública do bucket', () => {
    expect(newsCoverUrl('abc/capa.jpg')).toBe(
      'https://exemplo.supabase.co/storage/v1/object/public/news-covers/abc/capa.jpg'
    );
  });

  it('devolve null sem path (notícia sem capa)', () => {
    expect(newsCoverUrl(null)).toBeNull();
    expect(newsCoverUrl(undefined)).toBeNull();
  });
});

describe('validateCoverFile', () => {
  const file = (size: number, type: string) =>
    ({ size, type, name: 'capa.jpg' }) as File;

  it('aceita JPG dentro do limite', () => {
    expect(validateCoverFile(file(1000, 'image/jpeg'))).toBeNull();
  });

  it('recusa acima de 5 MB', () => {
    expect(validateCoverFile(file(MAX_COVER_BYTES + 1, 'image/png'))).toMatch(/muito grande/);
  });

  it('recusa formato fora da lista', () => {
    expect(validateCoverFile(file(1000, 'application/pdf'))).toMatch(/não suportado/);
  });
});
