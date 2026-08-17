import { Suspense } from 'react';
import { TitleExperiencePage } from '@/components/title-experience-page';

export default function Page() {
  return (
    <Suspense fallback={<main className="watch-loading" aria-busy="true" />}>
      <TitleExperiencePage />
    </Suspense>
  );
}
