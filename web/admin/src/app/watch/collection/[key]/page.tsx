import { Suspense } from 'react';
import { DiscoveryDetailPage } from '@/components/discovery-detail-page';

export default function Page() {
  return <Suspense fallback={<main className="watch-loading" aria-busy="true" />}><DiscoveryDetailPage kind="collections" /></Suspense>;
}
