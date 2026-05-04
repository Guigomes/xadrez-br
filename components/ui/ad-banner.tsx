'use client';

import { useEffect, useRef } from 'react';

// Quando tiver AdSense aprovado, preencha aqui e mude ADSENSE_ENABLED para true
const ADSENSE_ENABLED = false;
const ADSENSE_PUB_ID = 'ca-pub-XXXXXXXXXXXXXXXXX';

interface AdBannerProps {
  slot: string;
  format?: 'auto' | 'horizontal' | 'rectangle';
  className?: string;
}

export function AdBanner({ slot, format = 'auto', className = '' }: AdBannerProps) {
  const ref = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (!ADSENSE_ENABLED) return;
    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch {}
  }, []);

  if (!ADSENSE_ENABLED) {
    return (
      <div className={`flex items-center justify-center rounded-lg border border-dashed border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-300 dark:text-gray-700 select-none ${className}`}>
        Publicidade
      </div>
    );
  }

  return (
    <ins
      ref={ref}
      className={`adsbygoogle block ${className}`}
      data-ad-client={ADSENSE_PUB_ID}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}
