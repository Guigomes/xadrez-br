'use client';

/**
 * Interruptor liga/desliga (toggle). Botão com role="switch" + aria-checked: leitor de tela
 * anuncia "ligado/desligado", e o rótulo inteiro é clicável (área de toque maior no celular).
 */
export function Switch({
  checked,
  onChange,
  label,
  className = '',
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`group inline-flex min-h-9 items-center gap-2.5 rounded-full text-sm text-gray-700 transition-colors focus:outline-none dark:text-gray-300 ${className}`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-brand-500 group-focus-visible:ring-offset-2 dark:group-focus-visible:ring-offset-gray-950 ${
          checked ? 'bg-brand-600 dark:bg-brand-500' : 'bg-gray-300 dark:bg-gray-700'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span className={checked ? 'font-medium text-gray-900 dark:text-gray-100' : ''}>{label}</span>
    </button>
  );
}
