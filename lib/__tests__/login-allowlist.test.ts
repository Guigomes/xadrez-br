import { afterEach, describe, expect, it } from 'vitest';
import { isLoginAllowed, loginAllowlist } from '../auth/login-allowlist';

describe('lista de acesso da homologação (LOGIN_ALLOWLIST)', () => {
  afterEach(() => { delete process.env.LOGIN_ALLOWLIST; });

  it('sem a variável (produção, dev) todo mundo entra', () => {
    expect(loginAllowlist()).toBeNull();
    expect(isLoginAllowed('qualquer@exemplo.com')).toBe(true);
  });

  it('com a variável, só e-mails da lista — sem diferença de caixa nem espaços', () => {
    process.env.LOGIN_ALLOWLIST = ' Dono@Gmail.com , gambito.teste.*@example.com,xbr.e2e.*@gmail.com ';
    expect(isLoginAllowed('dono@gmail.com')).toBe(true);
    expect(isLoginAllowed('DONO@gmail.com ')).toBe(true);
    expect(isLoginAllowed('gambito.teste.jogador1@example.com')).toBe(true);
    expect(isLoginAllowed('xbr.e2e.123.abc@gmail.com')).toBe(true);
    expect(isLoginAllowed('outro@gmail.com')).toBe(false);
    expect(isLoginAllowed('dono@gmail.com.br')).toBe(false);
    expect(isLoginAllowed(null)).toBe(false);
  });

  it('o curinga não vira expressão regular aberta (ponto é ponto)', () => {
    process.env.LOGIN_ALLOWLIST = 'a.b@x.com';
    expect(isLoginAllowed('aXb@x.com')).toBe(false);
  });
});
