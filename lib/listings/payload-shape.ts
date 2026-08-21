import { fnv1a } from "@/lib/workers/profile-shuffle";

export type PayloadOptionals = {
  includeQuantity: boolean;
  includePriceByAgreement: boolean;
};

export function getPayloadOptionals(profileId: string): PayloadOptionals {
  return {
    includeQuantity: fnv1a(`qty:${profileId}`) % 2 === 0,
    includePriceByAgreement: fnv1a(`pba:${profileId}`) % 2 === 0,
  };
}

/** Fisher-Yates permutacija ključeva, seedovana po profilu. */
export function permuteObjectKeys<T extends Record<string, unknown>>(
  obj: T,
  profileId: string,
): T {
  const keys = Object.keys(obj);
  let h = fnv1a(`payload-keys:${profileId}`);
  for (let i = keys.length - 1; i > 0; i--) {
    h = Math.imul(h ^ i, 0x01000193) >>> 0;
    const j = h % (i + 1);
    const tmp = keys[i]!;
    keys[i] = keys[j]!;
    keys[j] = tmp;
  }
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    out[key] = obj[key];
  }
  return out as T;
}
