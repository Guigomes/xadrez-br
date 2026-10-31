import Image from 'next/image';

/** The generated transparent pieces share the same silhouette in every pairing view.
 * Next serves optimized thumbnails; the original PNGs are not downloaded per row. */

export function WhitePawn({ className }: { className?: string }) {
  return (
    <Image src="/images/chess-pieces/pawn-white-v1.png" alt="" aria-hidden="true" draggable={false} width={48} height={48} sizes="48px" className={`inline-block object-cover ${className ?? ''}`} />
  );
}

export function BlackPawn({ className }: { className?: string }) {
  return (
    <Image src="/images/chess-pieces/pawn-black-v1.png" alt="" aria-hidden="true" draggable={false} width={48} height={48} sizes="48px" className={`inline-block object-cover ${className ?? ''}`} />
  );
}
