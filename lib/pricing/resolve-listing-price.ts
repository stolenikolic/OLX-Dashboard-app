import { cheapSurcharge } from "@/lib/pricing/cheap-surcharge";
import { computeChosenBaseKm } from "@/lib/pricing/calculate";
import type {
  OfferOrigin,
  PriceCalculationInput,
  PriceMode,
} from "@/lib/pricing/types";
import {
  DEFAULT_COMPETITOR_MARGIN_DROP,
  DEFAULT_COMPETITOR_UNDERCUT_KM,
} from "@/lib/pricing/types";
import { applyRandomVariance } from "@/lib/pricing/variance";

export type CompetitorMatchInfo = {
  price: number;
  sellerId: number;
  sellerName: string | null;
  matchedTitle: string;
};

export type ResolveListingPriceInput = {
  calcInput: PriceCalculationInput;
  mode: PriceMode;
  competitorMin?: CompetitorMatchInfo | null;
  undercutKm?: number;
  marginDrop?: number;
  applyVariance?: boolean;
  rng?: () => number;
};

export type ResolveListingPriceResult = {
  finalPrice: number;
  /** Formula 10% + cheap surcharge (prije varijanse). */
  target: number;
  /** Formula (marža−drop) + cheap surcharge (prije varijanse). */
  floor: number;
  /** Cijena prije varijanse (target ili max(comp−1, floor)). */
  base: number;
  floorApplied: boolean;
  origin: OfferOrigin;
  wasImport: boolean;
  variancePct: number | null;
  competitor: CompetitorMatchInfo | null;
  surcharge: number;
};

/**
 * Mode-aware rezolucija cijene za listing.
 *
 * original:            target = base10 + cheap
 * competitor_minus_1:  max(competitor − undercut, floor) ili fallback target
 *
 * Cheap-doplata je ugrađena u floor/target — NE dodaje se povrh competitor−1.
 */
export function resolveListingPrice(
  input: ResolveListingPriceInput,
): ResolveListingPriceResult {
  const {
    calcInput,
    mode,
    competitorMin = null,
    undercutKm = DEFAULT_COMPETITOR_UNDERCUT_KM,
    marginDrop = DEFAULT_COMPETITOR_MARGIN_DROP,
    applyVariance = true,
    rng = Math.random,
  } = input;

  const chosen10 = computeChosenBaseKm({ ...calcInput, marginDrop: 0 });
  const chosen8 = computeChosenBaseKm({ ...calcInput, marginDrop });

  const surcharge10 = cheapSurcharge(chosen10.basePrice);
  const surcharge8 = cheapSurcharge(chosen8.basePrice);
  const target = Math.round(chosen10.basePrice + surcharge10);
  const floor = Math.round(chosen8.basePrice + surcharge8);

  let base = target;
  let floorApplied = false;

  if (mode === "competitor_minus_1" && competitorMin != null) {
    const candidate = Math.round(competitorMin.price) - undercutKm;
    base = Math.max(candidate, floor);
    floorApplied = candidate < floor;
  }

  if (!applyVariance) {
    return {
      finalPrice: base,
      target,
      floor,
      base,
      floorApplied,
      origin: chosen10.origin,
      wasImport: chosen10.wasImport,
      variancePct: null,
      competitor: competitorMin,
      surcharge: surcharge10,
    };
  }

  const { price: finalPrice, variancePct } = applyRandomVariance(
    base,
    calcInput.global.random_pct_min,
    calcInput.global.random_pct_max,
    rng,
  );

  return {
    finalPrice,
    target,
    floor,
    base,
    floorApplied,
    origin: chosen10.origin,
    wasImport: chosen10.wasImport,
    variancePct,
    competitor: competitorMin,
    surcharge: surcharge10,
  };
}
