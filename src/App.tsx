import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import {
  CHANGE_PASSWORD_PATH,
  FORGOT_PASSWORD_PATH,
  HISTORY_DASHBOARD_PATH,
  LIVE_TRACKING_PATH,
  RESET_PASSWORD_PATH,
} from './auth/paths'
import { useThemeStore } from './store/themeStore'
import { Account } from './routes/Account'
import { ForgotPassword } from './routes/ForgotPassword'
import { HelloWorld } from './routes/HelloWorld'
import { HistoryDashboard } from './routes/HistoryDashboard'
import { LiveTracking } from './routes/LiveTracking'
import { Login } from './routes/Login'
import { NotFound } from './routes/NotFound'
import { RequireAuth } from './routes/RequireAuth'
import { ResetPassword } from './routes/ResetPassword'

export function App() {
  const theme = useThemeStore((state) => state.theme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <RequireAuth>
                <HelloWorld />
              </RequireAuth>
            }
          />
          <Route
            path={LIVE_TRACKING_PATH}
            element={
              <RequireAuth>
                <LiveTracking />
              </RequireAuth>
            }
          />
          <Route
            path={HISTORY_DASHBOARD_PATH}
            element={
              <RequireAuth>
                <HistoryDashboard />
              </RequireAuth>
            }
          />
          <Route path="/login" element={<Login />} />
          <Route path={FORGOT_PASSWORD_PATH} element={<ForgotPassword />} />
          <Route path={RESET_PASSWORD_PATH} element={<ResetPassword />} />
          <Route
            path={CHANGE_PASSWORD_PATH}
            element={
              <RequireAuth allowMustChangePassword>
                <Account />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
