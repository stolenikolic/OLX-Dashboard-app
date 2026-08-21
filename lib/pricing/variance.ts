/**
 * Primjenjuje random varijaciju ±[minPct, maxPct] sa nasumičnim predznakom.
 * Vraća zaokruženu cijenu na cijeli KM.
 */
export function applyRandomVariance(
  price: number,
  minPct: number,
  maxPct: number,
  rng: () => number = Math.random,
): { price: number; variancePct: number } {
  const magnitude = minPct + rng() * (maxPct - minPct);
  const sign = rng() < 0.5 ? -1 : 1;
  const variancePct = sign * magnitude;
  const adjusted = price * (1 + variancePct);
  return { price: Math.round(adjusted), variancePct };
}

/**
 * Varijacija u rasponu [lowPct, highPct] (iste jedinice kao app_settings:
 * 0.01 = 1%). Npr. -0.005 do +0.02.
 */
export function applyRangeVariance(
  price: number,
  lowPct: number,
  highPct: number,
  rng: () => number = Math.random,
): { price: number; variancePct: number } {
  const lo = Math.min(lowPct, highPct);
  const hi = Math.max(lowPct, highPct);
  const variancePct = lo + rng() * (hi - lo);
  return { price: Math.round(price * (1 + variancePct)), variancePct };
}

/** Dozvoljeni okvir u frakcijama: −1% … +5%. */
export const VARIANCE_ABS_MIN = -0.01;
export const VARIANCE_ABS_MAX = 0.05;

export type VarianceRange = { low: number; high: number };

export function generateVarianceForNewProfile(
  existing: VarianceRange[],
): VarianceRange {
  for (let attempt = 0; attempt < 60; attempt++) {
    const low = -0.01 + Math.random() * 0.025; // −1% … +1.5%
    const width = 0.015 + Math.random() * 0.02; // 1.5% … 3.5%
    const high = Math.min(VARIANCE_ABS_MAX, low + width);
    const distinct = existing.every(
      (e) => Math.abs(e.low - low) >= 0.003 || Math.abs(e.high - high) >= 0.003,
    );
    if (distinct) {
      return {
        low: Number(low.toFixed(4)),
        high: Number(high.toFixed(4)),
      };
    }
  }
  return { low: -0.005, high: 0.02 };
}
