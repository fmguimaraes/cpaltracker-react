import { BrowserRouter, Navigate, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { AppShellLayout } from './chrome/AppShellLayout'
import {
  ALERTS_PATH,
  CHANGE_PASSWORD_PATH,
  DEVICE_PILOTAGE_PATH,
  FORGOT_PASSWORD_PATH,
  HISTORY_DASHBOARD_PATH,
  LIVE_TRACKING_PATH,
  PULSE_PATH,
  RESET_PASSWORD_PATH,
  TRENDS_PATH,
} from './auth/paths'
import { DocumentTitle } from '@/chrome/DocumentTitle'
import { ThemeProvider } from '@/app/theme'
import { TooltipProvider } from '@/ui/tooltip'
import { Account } from './routes/Account'
import { AlertDetail } from './routes/AlertDetail'
import { Alerts } from './routes/Alerts'
import { DeviceReadings } from './routes/DeviceReadings'
import { AccountLayout } from './routes/AccountLayout'
import { DevicePilotage } from './routes/DevicePilotage'
import { PilotageDeviceDetail } from './routes/PilotageDeviceDetail'
import { PilotageDeviceList } from './routes/PilotageDeviceList'
import { ForgotPassword } from './routes/ForgotPassword'
import { HistoryDashboard } from './routes/HistoryDashboard'
import { LiveTracking } from './routes/LiveTracking'
import { Pulse } from './routes/Pulse'
import { Login } from './routes/Login'
import { NotFound } from './routes/NotFound'
import { RequireAuth } from './routes/RequireAuth'
import { ResetPassword } from './routes/ResetPassword'
import { Trends } from './routes/Trends'

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
                {/* The landing page is Pulse: "/" (post-login default, "back to app" links) redirects there */}
                <Route path="/" element={<Navigate to={PULSE_PATH} replace />} />
                <Route path={PULSE_PATH} element={<Pulse />} />
                {/* Deprecated (unified shell 2026-11-25): Suivi en direct and Historique are superseded by
                    Pulse; kept with their nav entries until their removal is confirmed (remaining gaps listed
                    in the unified-shell report). */}
                <Route path={LIVE_TRACKING_PATH} element={<LiveTracking />} />
                <Route
                  path={HISTORY_DASHBOARD_PATH}
                  element={<HistoryDashboard />}
                />
                <Route path={DEVICE_PILOTAGE_PATH} element={<DevicePilotage />}>
                  <Route index element={<PilotageDeviceList />} />
                  <Route path=":chipId" element={<PilotageDeviceDetail />} />
                  <Route path=":chipId/releves" element={<DeviceReadings />} />
                </Route>
                <Route path={TRENDS_PATH} element={<Trends />} />
                <Route path={ALERTS_PATH} element={<Alerts />} />
                <Route path={`${ALERTS_PATH}/:anomalyKey`} element={<AlertDetail />} />
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
