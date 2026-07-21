import type { SupabaseClient } from "@supabase/supabase-js";

import {
  calculatePrice,
  resolveListingPrice,
  type CategoryPricing,
  type CompetitorMatchInfo,
  type GlobalPricing,
  type OfferInput,
  type PriceCalculationResult,
  type PriceMode,
  type ProfilePricing,
  type ResolveListingPriceResult,
  DEFAULT_COMPETITOR_MARGIN_DROP,
  DEFAULT_COMPETITOR_UNDERCUT_KM,
  DEFAULT_GLOBAL_PRICING,
  DEFAULT_PROFILE_PRICING,
} from "@/lib/pricing";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

export async function loadGlobalPricing(admin: Admin): Promise<GlobalPricing> {
  const { data, error } = await admin
    .from("app_settings")
    .select(
      "eur_factor, pdv_factor, random_pct_min, random_pct_max",
    )
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_GLOBAL_PRICING;
  }

  return {
    eur_factor: Number(data.eur_factor),
    pdv_factor: Number(data.pdv_factor),
    random_pct_min: Number(data.random_pct_min),
    random_pct_max: Number(data.random_pct_max),
  };
}

export type CompetitorPricingSettings = {
  undercutKm: number;
  marginDrop: number;
};

export async function loadCompetitorPricingSettings(
  admin: Admin,
): Promise<CompetitorPricingSettings> {
  const { data, error } = await admin
    .from("app_settings")
    .select("competitor_undercut_km, competitor_margin_drop")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return {
      undercutKm: DEFAULT_COMPETITOR_UNDERCUT_KM,
      marginDrop: DEFAULT_COMPETITOR_MARGIN_DROP,
    };
  }

  return {
    undercutKm:
      data.competitor_undercut_km != null
        ? Number(data.competitor_undercut_km)
        : DEFAULT_COMPETITOR_UNDERCUT_KM,
    marginDrop:
      data.competitor_margin_drop != null
        ? Number(data.competitor_margin_drop)
        : DEFAULT_COMPETITOR_MARGIN_DROP,
  };
}

export async function loadProfilePricing(
  admin: Admin,
  profileId: string,
): Promise<ProfilePricing> {
  const { data, error } = await admin
    .from("profiles")
    .select("kurs, kurs_uvoz")
    .eq("id", profileId)
    .single();

  if (error || !data) {
    throw new Error(`Profil ${profileId} nije pronađen.`);
  }

  return {
    kurs: Number(data.kurs),
    kurs_uvoz: Number(data.kurs_uvoz),
  };
}

export async function loadProfilePriceMode(
  admin: Admin,
  profileId: string,
): Promise<PriceMode> {
  const { data, error } = await admin
    .from("profiles")
    .select("price_mode")
    .eq("id", profileId)
    .single();

  if (error || !data) {
    throw new Error(`Profil ${profileId} nije pronađen.`);
  }

  return data.price_mode ?? "original";
}

export type ProductPricingRow = {
  id: string;
  title: string;
  feed_uuid: string;
  import_override: Database["public"]["Enums"]["import_override"];
  category: CategoryPricing;
  olxCategoryId: number | null;
  offers: OfferInput[];
};

export async function loadProductForPricing(
  admin: Admin,
  productId: string,
): Promise<ProductPricingRow> {
  const { data, error } = await admin
    .from("products")
    .select(
      `
      id,
      title,
      feed_uuid,
      import_override,
      categories (
        marza_huf,
        marza_bih,
        import_flag,
        olx_category_id
      ),
      product_offers (
        origin,
        acquisition_price
      )
    `,
    )
    .eq("id", productId)
    .single();

  if (error || !data) {
    throw new Error(`Proizvod ${productId} nije pronađen.`);
  }

  const cat = data.categories;
  const category: CategoryPricing = cat
    ? {
        marza_huf: Number(cat.marza_huf),
        marza_bih: Number(cat.marza_bih),
        import_flag: cat.import_flag,
      }
    : {
        marza_huf: 1.1,
        marza_bih: 1.1,
        import_flag: false,
      };

  const offers: OfferInput[] = (data.product_offers ?? []).map((o) => ({
    origin: o.origin,
    acquisition_price: Number(o.acquisition_price),
  }));

  return {
    id: data.id,
    title: data.title,
    feed_uuid: data.feed_uuid,
    import_override: data.import_override,
    category,
    olxCategoryId:
      cat?.olx_category_id != null ? Number(cat.olx_category_id) : null,
    offers,
  };
}

export async function calculateProductPrice(
  admin: Admin,
  profileId: string,
  productId: string,
  options?: { applyVariance?: boolean; rng?: () => number },
): Promise<PriceCalculationResult & { product: ProductPricingRow }> {
  const [global, profile, product] = await Promise.all([
    loadGlobalPricing(admin),
    loadProfilePricing(admin, profileId),
    loadProductForPricing(admin, productId),
  ]);

  const result = calculatePrice({
    offers: product.offers,
    category: product.category,
    product: { import_override: product.import_override },
    profile,
    global,
    applyVariance: options?.applyVariance,
    rng: options?.rng,
  });

  return { ...result, product };
}

/**
 * Mode-aware cijena za listing (original / competitor_minus_1).
 */
export async function resolveProductListingPrice(
  admin: Admin,
  profileId: string,
  productId: string,
  options?: {
    mode?: PriceMode;
    competitorMin?: CompetitorMatchInfo | null;
    applyVariance?: boolean;
    rng?: () => number;
  },
): Promise<
  ResolveListingPriceResult & {
    product: ProductPricingRow;
    mode: PriceMode;
  }
> {
  const [global, profile, product, mode, competitorSettings] =
    await Promise.all([
      loadGlobalPricing(admin),
      loadProfilePricing(admin, profileId),
      loadProductForPricing(admin, productId),
      options?.mode
        ? Promise.resolve(options.mode)
        : loadProfilePriceMode(admin, profileId),
      loadCompetitorPricingSettings(admin),
    ]);

  const result = resolveListingPrice({
    calcInput: {
      offers: product.offers,
      category: product.category,
      product: { import_override: product.import_override },
      profile,
      global,
    },
    mode,
    competitorMin: options?.competitorMin ?? null,
    undercutKm: competitorSettings.undercutKm,
    marginDrop: competitorSettings.marginDrop,
    applyVariance: options?.applyVariance,
    rng: options?.rng,
  });

  return { ...result, product, mode };
}

/** Fallback when nema profila u bazi — koristi PRD defaulte. */
export function defaultProfilePricing(): ProfilePricing {
  return DEFAULT_PROFILE_PRICING;
}
