import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { AppShellLayout } from './chrome/AppShellLayout'
import {
  CHANGE_PASSWORD_PATH,
  DEVICE_PILOTAGE_PATH,
  FORGOT_PASSWORD_PATH,
  HISTORY_DASHBOARD_PATH,
  LIVE_TRACKING_PATH,
  RESET_PASSWORD_PATH,
} from './auth/paths'
import { DocumentTitle } from '@/chrome/DocumentTitle'
import { ThemeProvider } from '@/app/theme'
import { TooltipProvider } from '@/ui/tooltip'
import { Account } from './routes/Account'
import { AccountLayout } from './routes/AccountLayout'
import { DevicePilotage } from './routes/DevicePilotage'
import { ForgotPassword } from './routes/ForgotPassword'
import { HelloWorld } from './routes/HelloWorld'
import { HistoryDashboard } from './routes/HistoryDashboard'
import { LiveTracking } from './routes/LiveTracking'
import { Login } from './routes/Login'
import { NotFound } from './routes/NotFound'
import { RequireAuth } from './routes/RequireAuth'
import { ResetPassword } from './routes/ResetPassword'

export function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <BrowserRouter>
            <DocumentTitle />
            <Routes>
              <Route
                element={
                  <RequireAuth>
                    <AppShellLayout />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<HelloWorld />} />
                <Route path={LIVE_TRACKING_PATH} element={<LiveTracking />} />
                <Route
                  path={HISTORY_DASHBOARD_PATH}
                  element={<HistoryDashboard />}
                />
                <Route
                  path={DEVICE_PILOTAGE_PATH}
                  element={<DevicePilotage />}
                />
              </Route>
              <Route path="/login" element={<Login />} />
              <Route path={FORGOT_PASSWORD_PATH} element={<ForgotPassword />} />
              <Route path={RESET_PASSWORD_PATH} element={<ResetPassword />} />
              <Route
                path={CHANGE_PASSWORD_PATH}
                element={
                  <RequireAuth allowMustChangePassword>
                    <AccountLayout />
                  </RequireAuth>
                }
              >
                <Route index element={<Account />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
}
