// Wrapper do bbpPairings compilado para WASM (lib/pairing/wasm/).
// Instância nova por chamada — sem estado compartilhado.
// Import dinâmico com webpackIgnore: o glue do Emscripten é carregado do
// filesystem em runtime (Node), fora do bundle.
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export type EngineResult =
  | { ok: true; output: string; stderr: string }
  | { ok: false; code: 'NO_VALID_PAIRING' | 'INVALID_INPUT' | 'SIZE_LIMIT' | 'ENGINE_ERROR'; detail: string };

const EXIT_CODES: Record<number, 'NO_VALID_PAIRING' | 'ENGINE_ERROR' | 'INVALID_INPUT' | 'SIZE_LIMIT'> = {
  1: 'NO_VALID_PAIRING',
  2: 'ENGINE_ERROR',
  3: 'INVALID_INPUT',
  4: 'SIZE_LIMIT',
  5: 'ENGINE_ERROR',
};

function wasmModulePath(): string {
  return path.join(process.cwd(), 'lib', 'pairing', 'wasm', 'bbppairings.mjs');
}

export async function runDutchPairing(trfbx: string): Promise<EngineResult> {
  const stderr: string[] = [];
  const { default: createModule } = await import(
    /* webpackIgnore: true */ pathToFileURL(wasmModulePath()).href
  );
  const mod = await createModule({
    noInitialRun: true,
    print: () => {},
    printErr: (l: string) => stderr.push(l),
  });
  mod.FS.writeFile('/input.trf', trfbx);

  let exit: number;
  try {
    exit = mod.callMain(['--dutch', '/input.trf', '-p', '/output.txt']);
  } catch (e: any) {
    if (typeof e?.status === 'number') exit = e.status;
    else return { ok: false, code: 'ENGINE_ERROR', detail: String(e?.message ?? e) };
  }

  if (exit !== 0) {
    return { ok: false, code: EXIT_CODES[exit] ?? 'ENGINE_ERROR', detail: stderr.join('\n') };
  }
  const output = mod.FS.readFile('/output.txt', { encoding: 'utf8' }) as string;
  return { ok: true, output, stderr: stderr.join('\n') };
}
