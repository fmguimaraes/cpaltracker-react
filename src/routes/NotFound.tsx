import { Link, Route, Routes } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { HOME_PATH } from '../auth/paths'
import { AppShellLayout } from '../chrome/AppShellLayout'
import { RequireAuth } from './RequireAuth'
import { Button } from '@/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from '@/ui/empty'
import { PageHeader } from '@/ui/patterns/page-header'

/** PAT-NOT-FOUND (ref: showcase/patterns/NotFound.tsx): header, one Empty, a way home. */
function NotFoundContent() {
  return (
    <div data-testid="pat-not-found">
      <PageHeader title="404 — Page not found" />
      <div className="p-4 md:p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Compass aria-hidden="true" />
            </EmptyMedia>
            <EmptyDescription>
              The route you requested doesn't exist in cpaltracker-react.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to={HOME_PATH} data-testid="not-found-home">
                Home
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    </div>
  )
}

/**
 * Catch-all route. Authenticated, it sits inside the app shell (nested Routes under the splat
 * give the shell its Outlet); anonymous, it stands alone. Both offer a way home.
 */
export function NotFound() {
  const { status } = useAuth()
  // The anonymous branch must stay outside RequireAuth, which would redirect to the login page.
  if (status !== 'anonymous') {
    // Loading shows the guard's spinner; authenticated is gated like every shell route.
    return (
      <RequireAuth>
        <Routes>
          <Route element={<AppShellLayout />}>
            <Route path="*" element={<NotFoundContent />} />
          </Route>
        </Routes>
      </RequireAuth>
    )
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center">
      <NotFoundContent />
    </main>
  )
}
