import { cheapSurcharge } from "@/lib/pricing/cheap-surcharge";
import { resolveImportMode } from "@/lib/pricing/import";
import type {
  CategoryPricing,
  ChosenBaseResult,
  GlobalPricing,
  OfferInput,
  PriceCalculationInput,
  PriceCalculationResult,
  ProfilePricing,
} from "@/lib/pricing/types";
import { applyRandomVariance } from "@/lib/pricing/variance";

function roundKm(value: number): number {
  return Math.round(value);
}

/** Standardni HUF: acq / KURS * EUR * marza_huf */
export function calculateHufStandard(
  acquisitionPrice: number,
  profile: ProfilePricing,
  marzaHuf: number,
  global: GlobalPricing,
): number {
  return (
    (acquisitionPrice / profile.kurs) *
    global.eur_factor *
    marzaHuf
  );
}

/** Uvozni HUF: acq / kurs_uvoz * EUR * marza_huf * PDV */
export function calculateHufImport(
  acquisitionPrice: number,
  profile: ProfilePricing,
  marzaHuf: number,
  global: GlobalPricing,
): number {
  return (
    (acquisitionPrice / profile.kurs_uvoz) *
    global.eur_factor *
    marzaHuf *
    global.pdv_factor
  );
}

/** BiH: acq * marza_bih * PDV */
export function calculateBih(
  acquisitionPrice: number,
  marzaBih: number,
  global: GlobalPricing,
): number {
  return acquisitionPrice * marzaBih * global.pdv_factor;
}

function findOffer(
  offers: OfferInput[],
  origin: "HUF" | "BIH",
): OfferInput | undefined {
  return offers.find((o) => o.origin === origin);
}

function applyMarginDrop(
  category: CategoryPricing,
  marginDrop: number,
): CategoryPricing {
  if (!marginDrop || marginDrop <= 0) return category;
  return {
    ...category,
    marza_huf: Math.max(1, category.marza_huf - marginDrop),
    marza_bih: Math.max(1, category.marza_bih - marginDrop),
  };
}

/**
 * Izračunava baznu cijenu (pobjednik HUF/BIH) bez doplate i bez varijanse.
 */
export function computeChosenBaseKm(
  input: PriceCalculationInput,
): ChosenBaseResult {
  const { offers, product, profile, global, marginDrop = 0 } = input;
  const category = applyMarginDrop(input.category, marginDrop);

  const useImport = resolveImportMode(
    product.import_override,
    category.import_flag,
  );

  const hufOffer = findOffer(offers, "HUF");
  const bihOffer = findOffer(offers, "BIH");

  let hufStandard: number | null = null;
  let hufImport: number | null = null;
  let hufChosen: number | null = null;

  if (hufOffer) {
    hufStandard = calculateHufStandard(
      hufOffer.acquisition_price,
      profile,
      category.marza_huf,
      global,
    );
    hufImport = calculateHufImport(
      hufOffer.acquisition_price,
      profile,
      category.marza_huf,
      global,
    );
    hufChosen = useImport ? hufImport : hufStandard;
  }

  const bih = bihOffer
    ? calculateBih(bihOffer.acquisition_price, category.marza_bih, global)
    : null;

  const candidates: { origin: "HUF" | "BIH"; raw: number; wasImport: boolean }[] =
    [];

  if (hufChosen != null) {
    candidates.push({ origin: "HUF", raw: hufChosen, wasImport: useImport });
  }
  if (bih != null) {
    candidates.push({ origin: "BIH", raw: bih, wasImport: false });
  }

  if (candidates.length === 0) {
    throw new Error("Artikal nema nijednu ponudu (HUF ili BiH).");
  }

  const winner = candidates.reduce((best, cur) =>
    cur.raw < best.raw ? cur : best,
  );

  return {
    basePrice: roundKm(winner.raw),
    origin: winner.origin,
    wasImport: winner.wasImport,
    breakdown: { hufStandard, hufImport, hufChosen, bih },
  };
}

/**
 * Izračunava OLX cijenu prema PRD §6.3–6.5 + cheap-item doplata.
 * Uspoređuje primjenjivi HUF (standard/uvoz) i BiH, bira nižu, dodaje
 * cheap surcharge, pa primjenjuje random ±%.
 */
export function calculatePrice(
  input: PriceCalculationInput,
): PriceCalculationResult {
  const {
    global,
    applyVariance = true,
    rng = Math.random,
  } = input;

  const chosen = computeChosenBaseKm(input);
  const surcharge = cheapSurcharge(chosen.basePrice);
  const priceWithSurcharge = roundKm(chosen.basePrice + surcharge);

  if (!applyVariance) {
    return {
      basePrice: chosen.basePrice,
      surcharge,
      priceWithSurcharge,
      finalPrice: priceWithSurcharge,
      origin: chosen.origin,
      wasImport: chosen.wasImport,
      variancePct: null,
      breakdown: chosen.breakdown,
    };
  }

  const { price: finalPrice, variancePct } = applyRandomVariance(
    priceWithSurcharge,
    global.random_pct_min,
    global.random_pct_max,
    rng,
  );

  return {
    basePrice: chosen.basePrice,
    surcharge,
    priceWithSurcharge,
    finalPrice,
    origin: chosen.origin,
    wasImport: chosen.wasImport,
    variancePct,
    breakdown: chosen.breakdown,
  };
}
