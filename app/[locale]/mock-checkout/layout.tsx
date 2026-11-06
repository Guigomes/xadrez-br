import { notFound } from 'next/navigation';
import { getSubscriptionBillingAvailability } from '@/lib/data/billing';
import { asaasMockAllowed } from '@/lib/asaas/client';

export default async function MockCheckoutLayout({ children }: { children: React.ReactNode }) {
  if (!asaasMockAllowed()) notFound();
  const { globalBilling, organizerBilling, playerHistoryBilling } = await getSubscriptionBillingAvailability();
  if (!globalBilling && !organizerBilling && !playerHistoryBilling) notFound();
  return children;
}
