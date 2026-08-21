/** FNV-1a 32-bit hash — deterministički, bez zavisnosti. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Stabilan per-profil sort ključ. */
export function profileOrderKey(profileId: string, itemId: string): number {
  return fnv1a(`${profileId}:${itemId}`);
}

/** Sortira niz in-place po per-profil hash ključu. */
export function sortByProfileOrder<T>(
  items: T[],
  profileId: string,
  getId: (item: T) => string,
): T[] {
  return items.sort(
    (a, b) =>
      profileOrderKey(profileId, getId(a)) -
      profileOrderKey(profileId, getId(b)),
  );
}
