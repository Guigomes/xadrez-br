import { notFound } from 'next/navigation';
import { isBillingEnabled } from '@/lib/data/billing';

export default async function MockCheckoutLayout({ children }: { children: React.ReactNode }) {
  if (!(await isBillingEnabled())) notFound();
  return children;
}
