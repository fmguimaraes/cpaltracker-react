export function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-text)' }}>
        404 — Page not found
      </h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        The route you requested doesn't exist in cpaltracker-react.
      </p>
    </main>
  )
}
