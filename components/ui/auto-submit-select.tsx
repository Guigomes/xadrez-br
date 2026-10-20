'use client';

import type { ReactNode } from 'react';

/** `<select>` que envia o formulário em volta assim que muda (filtros de página GET, sem botão extra). */
export function AutoSubmitSelect({
  name,
  defaultValue,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  name: string;
  defaultValue?: string;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      aria-label={ariaLabel}
      className={className}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
    >
      {children}
    </select>
  );
}
