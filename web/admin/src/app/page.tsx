import { Suspense } from 'react';
import { Dashboard } from '@/components/dashboard';

export default function HomePage() {
  return <Suspense fallback={<main className="setup-page" aria-busy="true" />}><Dashboard /></Suspense>;
}
