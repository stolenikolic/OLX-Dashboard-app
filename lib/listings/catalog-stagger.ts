import { fnv1a } from "@/lib/workers/profile-shuffle";

/** Deterministička odgoda 0–10 dana po (profil, proizvod). */
export function productEligibleAt(
  profileId: string,
  productId: string,
  createdAt: string,
): Date {
  const days = fnv1a(`stagger:${profileId}:${productId}`) % 11;
  return new Date(new Date(createdAt).getTime() + days * 86_400_000);
}

export function isProductEligibleNow(
  profileId: string,
  productId: string,
  createdAt: string,
  now: Date = new Date(),
): boolean {
  return productEligibleAt(profileId, productId, createdAt).getTime() <= now.getTime();
}
