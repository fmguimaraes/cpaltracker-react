import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080/api/v1')

// No other tab can answer in a test, so the auth bootstrap would only wait out the token request's timeout.
// tabSession.test.ts restores Node's channel to test the handoff itself.
vi.stubGlobal('BroadcastChannel', undefined)
