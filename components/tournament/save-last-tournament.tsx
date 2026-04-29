'use client';

import { useEffect } from 'react';

export function SaveLastTournament({ slug }: { slug: string }) {
  useEffect(() => {
    document.cookie = `last_tournament=${slug}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  }, [slug]);

  return null;
}
