'use client';

import { Button } from '@/components/ui/button';

export function PrintReportButton() {
  return <Button variant="secondary" onClick={() => window.print()}>Imprimir / salvar em PDF</Button>;
}
