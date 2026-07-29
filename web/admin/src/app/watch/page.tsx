import { Suspense } from 'react';
import { WatchPortal } from '@/components/watch-portal';

export default function WatchPage() {
  return <Suspense fallback={<main className="watch-loading" aria-busy="true" />}><WatchPortal /></Suspense>;
}
