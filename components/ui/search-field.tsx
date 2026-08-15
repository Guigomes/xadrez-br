'use client';

/**
 * Campo de busca por nome de jogador — classificação e rodadas. O filtro só
 * entra em ação a partir de 3 caracteres (lib/utils/text.ts,
 * matchesPlayerSearch); este componente é só o input, quem filtra é o
 * chamador (cada tela sabe a lista que está mostrando).
 */
export function SearchField({
  value, onChange, placeholder = 'Buscar jogador…', className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400" aria-hidden="true">
        🔍
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder-gray-500"
      />
    </div>
  );
}
