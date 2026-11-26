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
  /** Start order of the request that produced it (see `storeCache`). */
  seq: number
  group: CacheGroup
  contractId: number
}

const entries = new Map<string, Entry>()
/** Bumped by every clear/invalidate: a response that started before one is never stored (EC11, EC14). */
let generation = 0
/** Start order of requests; a slower older response never overwrites a newer-started one for the same key. */
let startCounter = 0

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
  const start = cacheStart()
  const value = await fetcher()
  storeCache(key, value, start)
  return value
}

/** Snapshot taken before a request starts; hand it back to `storeCache` with the response. */
export interface CacheStart {
  generation: number
  seq: number
}

export function cacheStart(): CacheStart {
  startCounter += 1
  return { generation, seq: startCounter }
}

/** When the cached value for `key` was fetched (epoch ms), or `undefined` if there is no fresh entry. */
export function peekFetchedAt(key: CacheKey): number | undefined {
  return peekCache(key) === undefined ? undefined : entries.get(keyOf(key))?.fetchedAt
}

/** Stores `value` unless a clear/invalidate happened since `start`, or a newer-started response is already stored. */
export function storeCache(key: CacheKey, value: unknown, start: CacheStart): void {
  if (start.generation !== generation) return
  const id = keyOf(key)
  const existing = entries.get(id)
  if (existing && existing.seq > start.seq) return
  entries.set(id, { value, fetchedAt: Date.now(), seq: start.seq, group: key.group, contractId: key.contractId })
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
