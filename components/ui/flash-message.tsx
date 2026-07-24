'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

interface Props {
  message: string;
}

export function FlashMessage({ message }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [visible, setVisible] = useState(true);

  function dismiss() {
    setVisible(false);
    router.replace(pathname);
  }

  useEffect(() => {
    const t = setTimeout(dismiss, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-green-200 dark:border-green-900/60 bg-green-50 dark:bg-green-950/30 px-4 py-3">
      <svg className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <p className="flex-1 text-sm font-medium text-green-800 dark:text-green-300">{message}</p>
      <button
        onClick={dismiss}
        className="flex-shrink-0 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200"
        aria-label="Fechar"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
