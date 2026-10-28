'use client';

import { useEffect, useRef, useState } from 'react';
import type { CbxLookupResult } from '@/lib/cbx/lookup';

export type CbxLookupState =
  | { state: 'idle' | 'loading' | 'not_found' | 'error' }
  | { state: 'found'; source: CbxLookupResult['source']; name: string };

/**
 * Busca o jogador pelo ID CBX enquanto a pessoa digita (600 ms depois de parar):
 * primeiro no nosso cadastro, depois na CBX (/api/players/cbx-lookup), e entrega o
 * resultado a `onFound` para preencher o formulário. Usado na inscrição pública e no
 * cadastro manual de participante pelo organizador.
 *
 * `initialId` (ID que já veio preenchido, ex.: do perfil) não é consultado, para não
 * sobrescrever o que já está no formulário; o mesmo ID também não é consultado duas
 * vezes seguidas.
 */
export function useCbxLookup(
  cbxId: string | undefined,
  onFound: (result: CbxLookupResult) => void,
  { initialId = '', enabled = true }: { initialId?: string; enabled?: boolean } = {}
): CbxLookupState {
  const [lookup, setLookup] = useState<CbxLookupState>({ state: 'idle' });
  const lastId = useRef(initialId);
  const onFoundRef = useRef(onFound);
  onFoundRef.current = onFound;

  useEffect(() => {
    const id = (cbxId ?? '').trim();
    if (!enabled || !/^\d{3,9}$/.test(id) || id === lastId.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      lastId.current = id;
      setLookup({ state: 'loading' });
      try {
        const res = await fetch(`/api/players/cbx-lookup?id=${encodeURIComponent(id)}`);
        if (cancelled) return;
        if (res.status === 404) { setLookup({ state: 'not_found' }); return; }
        if (!res.ok) throw new Error();
        const found = await res.json() as CbxLookupResult;
        if (cancelled) return;
        onFoundRef.current({ ...found, full_name: found.full_name.trim() });
        setLookup({ state: 'found', source: found.source, name: found.full_name.trim() });
      } catch {
        if (!cancelled) {
          lastId.current = '';
          setLookup({ state: 'error' });
        }
      }
    }, 600);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [cbxId, enabled]);

  return lookup;
}
