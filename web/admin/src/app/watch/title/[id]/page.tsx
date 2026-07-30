import { Suspense } from 'react';
import { WatchTitlePage } from '@/components/watch-title-page';

export default function Page() {
  return (
    <Suspense fallback={<main className="watch-loading" aria-busy="true" />}>
      <WatchTitlePage />
    </Suspense>
  );
}
