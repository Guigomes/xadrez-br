'use client';

import { useProfile } from '@/lib/hooks/use-auth';

/** Desenvolvedor do site (perfil admin). Algumas informações internas, como a homologação do torneio, só aparecem para ele. */
export function useIsDev(): boolean {
  const { data: profile } = useProfile();
  return profile?.role === 'admin';
}
