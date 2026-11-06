import { notFound } from 'next/navigation';
import { getSubscriptionBillingAvailability } from '@/lib/data/billing';

export default async function PlanosLayout({ children }: { children: React.ReactNode }) {
  const { globalBilling, organizerBilling, playerHistoryBilling } = await getSubscriptionBillingAvailability();
  if (!globalBilling && !organizerBilling && !playerHistoryBilling) notFound();
  return children;
}
