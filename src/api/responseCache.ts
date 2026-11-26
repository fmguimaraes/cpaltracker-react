/**
 * KAN-345 (FR24-FR27) — in-memory stale-while-revalidate cache for the three reads (`fetchPulse`,
 * `fetchPositions`, `fetchAnomalies`) and the Pilotage workspace derived from them.
 *
 * Memory only: a module-level `Map`, never `localStorage`, `sessionStorage` or IndexedDB (FR26).
 * Fetchers always hit the network and write their success here (so a refresh bypasses the cache,
 * FR25); readers use `peekCache`, which only returns an entry younger than `CACHE_MAX_AGE_MS`
 * (FR24, EC12). Errors never reach `store` (EC20). No imports: `client.ts` clears it on session end.
 */
export const CACHE_MAX_AGE_MS = 5 * 60 * 1000

/** `positions` covers fetchPositions, fetchPulse and the Pilotage workspace; `anomalies` fetchAnomalies. */
export type CacheGroup = 'positions' | 'anomalies'

export interface CacheKey {
  group: CacheGroup
  fn: string
  contractId: number
  params?: string
}

interface Entry {
  value: unknown
  fetchedAt: number
  group: CacheGroup
  contractId: number
}

const entries = new Map<string, Entry>()
/** Bumped by every clear/invalidate: a response that started before one is never stored (EC11, EC14). */
let generation = 0

function keyOf({ group, fn, contractId, params }: CacheKey): string {
  return [group, fn, contractId, params ?? ''].join('|')
}

/** The cached value if younger than the maximum age, else `undefined` (an expired entry is dropped). */
export function peekCache<T>(key: CacheKey): T | undefined {
  const id = keyOf(key)
  const entry = entries.get(id)
  if (!entry) return undefined
  if (Date.now() - entry.fetchedAt >= CACHE_MAX_AGE_MS) {
    entries.delete(id)
    return undefined
  }
  return entry.value as T
}

/** Runs `fetcher` (always over the network) and stores its success under `key`, unless the cache was reset meanwhile. */
export async function fetchAndStore<T>(key: CacheKey, fetcher: () => Promise<T>): Promise<T> {
  const startedAt = cacheGeneration()
  const value = await fetcher()
  storeCache(key, value, startedAt)
  return value
}

/** Snapshot taken before a request starts; hand it back to `storeCache` with the response. */
export function cacheGeneration(): number {
  return generation
}

/** Stores `value` unless a clear/invalidate happened since `startedAt` (the response may be stale or foreign). */
export function storeCache(key: CacheKey, value: unknown, startedAt: number): void {
  if (startedAt !== generation) return
  entries.set(keyOf(key), { value, fetchedAt: Date.now(), group: key.group, contractId: key.contractId })
}

/** Drops a group's entries: one contract's, or every contract's when `contractId` is omitted. */
export function invalidateCache(group: CacheGroup, contractId?: number): void {
  generation += 1
  for (const [id, entry] of entries) {
    if (entry.group === group && (contractId === undefined || entry.contractId === contractId)) entries.delete(id)
  }
}

/** Session end (logout, session loss) or a different identity: nothing survives (FR25, EC14). */
export function clearCache(): void {
  generation += 1
  entries.clear()
}
