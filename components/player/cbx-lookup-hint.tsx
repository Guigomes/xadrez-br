import type { CbxLookupState } from '@/lib/hooks/use-cbx-lookup';

/** Linha de status abaixo do campo ID CBX (ver useCbxLookup). */
export function CbxLookupHint({ lookup }: { lookup: CbxLookupState }) {
  if (lookup.state === 'idle') return null;
  return (
    <p
      aria-live="polite"
      className={`text-xs mt-1 ${lookup.state === 'found' ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}
    >
      {lookup.state === 'loading' && 'Buscando jogador…'}
      {lookup.state === 'found' && `${lookup.name} — dados preenchidos ${lookup.source === 'gambito' ? 'do cadastro no Gambito' : 'pela CBX'}. Confira abaixo.`}
      {lookup.state === 'not_found' && 'ID não encontrado. Preencha os dados abaixo.'}
      {lookup.state === 'error' && 'Não deu para buscar agora. Preencha os dados abaixo.'}
    </p>
  );
}
