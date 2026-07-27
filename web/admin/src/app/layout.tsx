export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          fontFamily: '"Poppins", "Segoe UI", Arial, sans-serif',
          background: 'linear-gradient(140deg, #08142f, #102b56, #0e3f7b)',
          color: '#f4f8ff',
        }}
      >
        <main
          style={{
            padding: 24,
            maxWidth: 900,
            margin: '0 auto',
          }}
        >
          {children}
        </main>
      </body>
    </html>
  );
}
