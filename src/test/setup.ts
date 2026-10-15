import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8080/api/v1')
