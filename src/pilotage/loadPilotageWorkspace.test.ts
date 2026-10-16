import { describe, expect, it, vi, afterEach } from 'vitest'
import { loadPilotageWorkspace } from './loadPilotageWorkspace'

function stubFetch(responder: (url: string) => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      return Promise.resolve(responder(url))
    }),
  )
}

describe('loadPilotageWorkspace (KAN-159 FR2, FR3, FR5, NFR2, NFR4)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports unauthorized on a 404 from the device list, without ever calling config.php', () => {
    let configCalled = false
    stubFetch((url) => {
      if (url.includes('/devices/positions.php')) {
        return new Response(JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }), {
          status: 404,
        })
      }
      configCalled = true
      return new Response('{}', { status: 200 })
    })

    return loadPilotageWorkspace(99).then((result) => {
      expect(result).toEqual({ kind: 'unauthorized' })
      expect(configCalled).toBe(false)
    })
  })

  it('reports empty when the contract has zero live devices, without probing eligibility', () => {
    let configCalled = false
    stubFetch((url) => {
      if (url.includes('/devices/positions.php')) {
        return new Response(JSON.stringify({ positions: [] }), { status: 200 })
      }
      configCalled = true
      return new Response('{}', { status: 200 })
    })

    return loadPilotageWorkspace(12).then((result) => {
      expect(result).toEqual({ kind: 'empty' })
      expect(configCalled).toBe(false)
    })
  })

  it('reports ineligible, carrying the API\'s own message, when the first device\'s config read is forbidden', () => {
    stubFetch((url) => {
      if (url.includes('/devices/positions.php')) {
        return new Response(
          JSON.stringify({ positions: [{ contractId: 12, chipId: 'CHIP-001', timestamp: null, latitude: null, longitude: null, ambientTemperature: null, humidity: null, mass: null, mpuTemperature: null, accelG: null }] }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify({ error: { code: 'forbidden', message: 'Device pilotage is limited to MAIN contracts.' } }),
        { status: 403 },
      )
    })

    return loadPilotageWorkspace(12).then((result) => {
      expect(result).toEqual({
        kind: 'ineligible',
        message: 'Device pilotage is limited to MAIN contracts.',
      })
    })
  })

  it('reports eligible with the full device list when the config probe succeeds', () => {
    const positions = [
      { contractId: 12, chipId: 'CHIP-001', timestamp: '2026-10-10T08:00:05Z', latitude: 48.8566, longitude: 2.3522, ambientTemperature: 19.1, humidity: 55, mass: 420, mpuTemperature: 21.5, accelG: 1.02 },
      { contractId: 12, chipId: 'CHIP-002', timestamp: null, latitude: null, longitude: null, ambientTemperature: null, humidity: null, mass: null, mpuTemperature: null, accelG: null },
    ]
    let probedDeviceId: string | null = null
    stubFetch((url) => {
      if (url.includes('/devices/positions.php')) {
        return new Response(JSON.stringify({ positions }), { status: 200 })
      }
      probedDeviceId = new URL(url).searchParams.get('deviceId')
      return new Response(
        JSON.stringify({ deviceId: 'CHIP-001', contractId: 12, reglageId: 1, updatedAt: null, config: {} }),
        { status: 200 },
      )
    })

    return loadPilotageWorkspace(12).then((result) => {
      expect(result).toEqual({ kind: 'eligible', devices: positions })
      expect(probedDeviceId).toBe('CHIP-001')
    })
  })

  it('propagates a generic service failure from the device list instead of swallowing it', async () => {
    stubFetch(() => new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'DB down' } }), { status: 503 }))

    await expect(loadPilotageWorkspace(12)).rejects.toThrow()
  })

  it('propagates a generic service failure from the eligibility probe instead of reporting ineligible', async () => {
    stubFetch((url) => {
      if (url.includes('/devices/positions.php')) {
        return new Response(
          JSON.stringify({ positions: [{ contractId: 12, chipId: 'CHIP-001', timestamp: null, latitude: null, longitude: null, ambientTemperature: null, humidity: null, mass: null, mpuTemperature: null, accelG: null }] }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ error: { code: 'service_unavailable', message: 'DB down' } }), { status: 503 })
    })

    await expect(loadPilotageWorkspace(12)).rejects.toThrow()
  })
})
