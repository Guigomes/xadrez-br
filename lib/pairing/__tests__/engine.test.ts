// Golden tests: o WASM deve produzir saída idêntica aos .output.expected
// do repositório upstream do bbpPairings (Apache 2.0).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runDutchPairing } from '../engine';
import { parseEngineOutput } from '../trf/parse-output';

const FIX = join(__dirname, 'fixtures');
const norm = (s: string) => s.replace(/\r\n/g, '\n').trim();

describe('bbpPairings WASM (golden upstream)', () => {
  for (const name of ['dutch_2025_C5', 'dutch_2025_C9', 'issue_7']) {
    it(name, async () => {
      const input = readFileSync(join(FIX, `${name}.input`), 'utf8');
      const expected = readFileSync(join(FIX, `${name}.output.expected`), 'utf8');
      const res = await runDutchPairing(input);
      expect(res.ok, res.ok ? '' : res.detail).toBe(true);
      if (res.ok) expect(norm(res.output)).toBe(norm(expected));
    });
  }

  it('exit 3 vira INVALID_INPUT', async () => {
    const res = await runDutchPairing('012 lixo\nsem XXR\n');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('INVALID_INPUT');
  });
});

describe('parseEngineOutput', () => {
  it('parseia pares e bye', () => {
    expect(parseEngineOutput('3\n1 5\n3 2\n6 0\n')).toEqual([
      { white: 1, black: 5 },
      { white: 3, black: 2 },
      { white: 6, black: null },
    ]);
  });
});
