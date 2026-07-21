/**
 * Cheap-item doplata — dodaje se na cijenu POSLIJE množenja maržom.
 * Primjenjuje se u oba price_mode režima (original i competitor_minus_1).
 */
export function cheapSurcharge(base: number): number {
  if (base <= 20) return 20;
  if (base <= 50) return 17;
  if (base <= 100) return 15;
  if (base <= 200) return 12;
  if (base <= 400) return 8;
  return 5;
}
