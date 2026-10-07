'use client';

import { Badge } from '@/components/ui/badge';
import { useIsDev } from '@/lib/hooks/use-is-dev';

// Homologação CBX: informação interna, só o desenvolvedor vê.
export function DevHomologatedBadge({ homologated }: { homologated: boolean | null | undefined }) {
  const isDev = useIsDev();
  if (!isDev || homologated == null) return null;
  return homologated ? (
    <Badge className="bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300">✅ Homologado</Badge>
  ) : (
    <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">Não homologado</Badge>
  );
}
