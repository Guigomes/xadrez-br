import { describe, it, expect } from 'vitest';
import ptBR from '../../messages/pt-BR.json';
import es from '../../messages/es.json';
import en from '../../messages/en.json';

// Achata o objeto em chaves com caminho pontilhado ('nav.tournaments') pra
// comparar o conjunto INTEIRO de chaves, não só o primeiro nível. Pega a
// regressão mais comum de i18n: chave nova adicionada só num idioma.
function flatKeys(obj: unknown, prefix = ''): string[] {
  if (obj === null || typeof obj !== 'object') return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

const ptKeys = new Set(flatKeys(ptBR));

describe('paridade de chaves das mensagens (pt-BR = fonte)', () => {
  // pt-BR é a fonte da verdade; cada idioma é comparado contra ele.
  for (const [name, msgs] of [['es', es], ['en', en]] as const) {
    it(`${name}.json tem exatamente as mesmas chaves que pt-BR.json`, () => {
      const keys = new Set(flatKeys(msgs));
      const faltando = [...ptKeys].filter((k) => !keys.has(k));
      const sobrando = [...keys].filter((k) => !ptKeys.has(k));
      expect({ faltando, sobrando }).toEqual({ faltando: [], sobrando: [] });
    });
  }
});
