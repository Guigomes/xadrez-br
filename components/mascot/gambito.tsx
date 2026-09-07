import Image from 'next/image';
import { cn } from '@/lib/utils/cn';

export type GambitoPose =
  | 'acenando'
  | 'alerta'
  | 'aprovado'
  | 'classificacao'
  | 'comemorando'
  | 'investigando'
  | 'pareamento'
  | 'pensando';

interface Props {
  pose?: GambitoPose;
  alt?: string;
  className?: string;
  priority?: boolean;
}

/** Mascote reutilizável; posição e escala pertencem ao contexto onde aparece. */
export function Gambito({ pose = 'acenando', alt = '', className, priority = false }: Props) {
  return (
    <Image
      src={`/mascot/gambito-${pose}.png`}
      alt={alt}
      width={256}
      height={256}
      priority={priority}
      className={cn('h-auto w-24 object-contain', className)}
    />
  );
}
