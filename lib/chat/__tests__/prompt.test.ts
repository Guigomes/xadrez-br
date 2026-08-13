import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, extractSources, SYSTEM_PROMPT, type RetrievedChunk } from '../prompt';

const chunkA: RetrievedChunk = { docSlug: 'inscricoes', docTitle: 'Inscrições', content: 'Conteúdo A', similarity: 0.8 };
const chunkB: RetrievedChunk = { docSlug: 'inscricoes', docTitle: 'Inscrições', content: 'Conteúdo B', similarity: 0.7 };
const chunkC: RetrievedChunk = { docSlug: 'ciclo-de-vida-torneio', docTitle: 'Ciclo de vida', content: 'Conteúdo C', similarity: 0.6 };

describe('buildSystemPrompt', () => {
  it('sem chunks, avisa que não achou nada relevante', () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain(SYSTEM_PROMPT);
    expect(prompt).toContain('nenhum trecho relevante');
  });

  it('inclui título e conteúdo de cada chunk recuperado', () => {
    const prompt = buildSystemPrompt([chunkA, chunkC]);
    expect(prompt).toContain('Inscrições');
    expect(prompt).toContain('Conteúdo A');
    expect(prompt).toContain('Ciclo de vida');
    expect(prompt).toContain('Conteúdo C');
  });

  it('regra de "só responder com base no contexto" sempre presente', () => {
    expect(buildSystemPrompt([chunkA])).toContain('SOMENTE com base no CONTEXTO');
  });

  it('cita o torneio da página quando informado', () => {
    const prompt = buildSystemPrompt([chunkA], { tournamentName: 'Copa 2026' });
    expect(prompt).toContain('Copa 2026');
    expect(prompt).toContain('está vendo agora');
  });

  it('sem torneio da página, não injeta linha de ambiente', () => {
    expect(buildSystemPrompt([chunkA])).not.toContain('está vendo agora');
    expect(buildSystemPrompt([], { tournamentName: null })).not.toContain('está vendo agora');
  });
});

describe('extractSources', () => {
  it('sem chunks, lista vazia', () => {
    expect(extractSources([])).toEqual([]);
  });

  it('deduplica por doc_slug', () => {
    const sources = extractSources([chunkA, chunkB, chunkC]);
    expect(sources).toEqual([
      { doc_slug: 'inscricoes', doc_title: 'Inscrições' },
      { doc_slug: 'ciclo-de-vida-torneio', doc_title: 'Ciclo de vida' },
    ]);
  });
});
