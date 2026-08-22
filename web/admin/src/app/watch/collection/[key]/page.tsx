import { Suspense } from 'react';
import { DiscoveryDetailPage } from '@/components/discovery-detail-page';
import { AuthenticatedCustomerShell } from '@/components/authenticated-customer-shell';

export default function Page() {
  return <Suspense fallback={<main className="watch-loading" aria-busy="true" />}><AuthenticatedCustomerShell><DiscoveryDetailPage kind="collections" /></AuthenticatedCustomerShell></Suspense>;
}
