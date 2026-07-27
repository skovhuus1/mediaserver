import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BoltBytes Media Server',
  description: 'Self-hosted media control plane',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
