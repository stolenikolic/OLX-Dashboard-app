import type { Database } from "@/types/database";

export type OfferOrigin = Database["public"]["Enums"]["offer_origin"];
export type ImportOverride = Database["public"]["Enums"]["import_override"];

export type OfferInput = {
  origin: OfferOrigin;
  acquisition_price: number;
};

export type CategoryPricing = {
  marza_huf: number;
  marza_bih: number;
  import_flag: boolean;
};

export type ProductPricing = {
  import_override: ImportOverride;
};

export type ProfilePricing = {
  kurs: number;
  kurs_uvoz: number;
};

export type GlobalPricing = {
  eur_factor: number;
  pdv_factor: number;
  random_pct_min: number;
  random_pct_max: number;
};

export type PriceCalculationInput = {
  offers: OfferInput[];
  category: CategoryPricing;
  product: ProductPricing;
  profile: ProfilePricing;
  global: GlobalPricing;
  /** Default true — primjenjuje random ±% iz global postavki. */
  applyVariance?: boolean;
  /** Optional RNG (0–1) for tests; defaults to Math.random. */
  rng?: () => number;
};

export type PriceCalculationResult = {
  /** Cijena prije random varijacije, zaokružena na cijeli KM. */
  basePrice: number;
  /** Konačna cijena za OLX (sa varijacijom). */
  finalPrice: number;
  /** Koje porijeklo ponude je pobijedilo. */
  origin: OfferOrigin;
  /** Da li je HUF grana računata kao uvoz. */
  wasImport: boolean;
  /** Primijenjeni random % (null ako varijacija isključena). */
  variancePct: number | null;
  /** Detalji za debug / log. */
  breakdown: {
    hufStandard: number | null;
    hufImport: number | null;
    hufChosen: number | null;
    bih: number | null;
  };
};

export const DEFAULT_GLOBAL_PRICING: GlobalPricing = {
  eur_factor: 1.95,
  pdv_factor: 1.17,
  random_pct_min: 0.01,
  random_pct_max: 0.02,
};

export const DEFAULT_PROFILE_PRICING: ProfilePricing = {
  kurs: 380,
  kurs_uvoz: 350,
};
