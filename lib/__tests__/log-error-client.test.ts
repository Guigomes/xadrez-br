import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportClientError } from '../log-error-client';

/**
 * O filtro de ruído é a única lógica desse módulo — o resto é um fetch
 * disparado e esquecido. Testa pelo efeito: chamou /api/log-error ou não.
 */
describe('reportClientError — filtro de ruído', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { location: { pathname: '/noticias' } });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('ignora erro de extensão de carteira cripto', () => {
    reportClientError(new Error('Failed to connect to MetaMask'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignora o loop benigno do ResizeObserver', () => {
    reportClientError(new Error('ResizeObserver loop limit exceeded'));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignora erro cujo stack vem de dentro da extensão', () => {
    const err = new Error('Qualquer coisa');
    err.stack = 'Error: x\n  at inpage.js (chrome-extension://abc123/inpage.js:1:1)';
    reportClientError(err);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reporta erro de verdade da aplicação', () => {
    const err = new Error('Cannot read properties of undefined');
    err.stack = 'Error: x\n  at Page (https://site.com/_next/static/chunk.js:1:1)';
    reportClientError(err);
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.message).toBe('Cannot read properties of undefined');
    expect(body.route).toBe('/noticias');
  });

  it('reporta erro sem stack (string solta) que não está na lista', () => {
    reportClientError('Script error genérico');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
