import { beforeEach } from 'vitest'
import { clearCache } from '../api/responseCache'

// KAN-345: the read cache is module state; every test starts with it empty so no test sees another's data.
beforeEach(() => clearCache())
