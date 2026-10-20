import type { ReactNode } from 'react';

/** Casca das páginas institucionais (privacidade, termos, contato): título, data e texto legível. */
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <div className="container-app max-w-3xl py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{title}</h1>
      {updated && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Última atualização: {updated}</p>}
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300 [&_a]:font-medium [&_a]:text-brand-700 [&_a]:underline dark:[&_a]:text-brand-300 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 dark:[&_h2]:text-gray-100 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}

export const CONTACT_WHATSAPP_LABEL = '+55 67 99268-3450';
export const contactWhatsappHref = (text: string) => `https://wa.me/5567992683450?text=${encodeURIComponent(text)}`;
