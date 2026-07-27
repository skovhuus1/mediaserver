import Link from 'next/link';

export default function Home() {
  return (
    <section style={{ display: 'grid', gap: 18, maxWidth: 520 }}>
      <h1 style={{ marginBottom: 0 }}>BoltBytes Media Server</h1>
      <p style={{ marginTop: 0 }}>Fase-1 kontrolpanel for backend, konti, entitlements og playback.</p>
      <div style={{ display: 'grid', gap: 10 }}>
        <Link
          href="/setup"
          style={{
            color: '#0b0e15',
            background: '#8dd3ff',
            border: '1px solid #57b4ff',
            borderRadius: 10,
            padding: '12px 16px',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Første opsætning
        </Link>
        <Link
          href="/login"
          style={{
            color: '#0b0e15',
            background: '#7ae3bd',
            border: '1px solid #3dc59b',
            borderRadius: 10,
            padding: '12px 16px',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Login
        </Link>
        <Link
          href="/update"
          style={{
            color: '#0b0e15',
            background: '#f4a261',
            border: '1px solid #ce7d4a',
            borderRadius: 10,
            padding: '12px 16px',
            textDecoration: 'none',
            fontWeight: 600,
          }}
        >
          Server opdatering
        </Link>
        <a
          href="/api/v1/system/health"
          target="_blank"
          rel="noreferrer"
          style={{
            color: '#0b0e15',
            background: '#f4f6ff',
            border: '1px solid #a1b6dc',
            borderRadius: 10,
            padding: '12px 16px',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          System health
        </a>
      </div>
    </section>
  );
}
