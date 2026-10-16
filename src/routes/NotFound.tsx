import { PageTitle } from '../chrome/PageTitle'

export function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-2 p-8 text-center">
      <PageTitle>404 — Page not found</PageTitle>
      <p style={{ color: 'var(--color-text-muted)' }}>
        The route you requested doesn't exist in cpaltracker-react.
      </p>
    </main>
  )
}
