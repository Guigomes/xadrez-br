/** Ícones de peão branco/preto — compartilhados entre a lista pública de emparceiramentos e os painéis de resultado do organizador/árbitro (mesma identidade visual nos dois lados). */

export function WhitePawn({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="5.5" r="4" fill="white" stroke="#9ca3af" strokeWidth="1.5" />
      <path d="M7 10.5C7 10.5 5.5 13 5 15H15C14.5 13 13 10.5 13 10.5C12 10 11 9.5 10 9.5C9 9.5 8 10 7 10.5Z" fill="white" stroke="#9ca3af" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 24H17L15 17H5L3 24Z" fill="white" stroke="#9ca3af" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function BlackPawn({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="5.5" r="4" fill="#1f2937" stroke="#6b7280" strokeWidth="1.5" />
      <path d="M7 10.5C7 10.5 5.5 13 5 15H15C14.5 13 13 10.5 13 10.5C12 10 11 9.5 10 9.5C9 9.5 8 10 7 10.5Z" fill="#1f2937" stroke="#6b7280" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 24H17L15 17H5L3 24Z" fill="#1f2937" stroke="#6b7280" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
