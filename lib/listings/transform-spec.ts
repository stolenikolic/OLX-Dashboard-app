/** Normalizuje feed spec vrijednosti u OLX-kompatibilan format. */
export function transformSpecValue(specKey: string, raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  switch (specKey) {
    case "clock_speed": {
      const m = s.match(/([\d.]+)/);
      return m ? m[1] : s;
    }
    case "tdp": {
      const m = s.match(/([\d.]+)/);
      return m ? m[1] : s;
    }
    default:
      return s;
  }
}
