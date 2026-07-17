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
