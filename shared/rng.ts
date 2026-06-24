// Mulberry32 PRNG — safe arithmetic only (no transcendentals), identical across JS runtimes.
// The no-transcendentals rule is load-bearing: Math.sin/cos/etc. may differ across engines.
export function makeRng(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
