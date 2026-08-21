import { renderDescription } from "@/lib/listings/description";
import {
  getPayloadOptionals,
  permuteObjectKeys,
} from "@/lib/listings/payload-shape";
import { sanitizeOlxTitle } from "@/lib/listings/sanitize-title";
import type { OlxListingAttribute } from "@/lib/olx/types";
import type { CreateListingPayload } from "@/lib/olx/types";

const OLX_TITLE_MAX = 65;

export function truncateOlxTitle(title: string): string {
  const t = sanitizeOlxTitle(title);
  if (t.length <= OLX_TITLE_MAX) return t;
  const cut = t.slice(0, OLX_TITLE_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > OLX_TITLE_MAX * 0.6) {
    return cut.slice(0, lastSpace).trim();
  }
  return cut.trim();
}

export type ListingBuildInput = {
  profileId: string;
  title: string;
  olxCategoryId: number;
  price: number;
  descriptionTemplate?: string | null;
  specs: Record<string, unknown>;
  attributes: OlxListingAttribute[];
};

export function buildListingPayload(input: ListingBuildInput): CreateListingPayload {
  const description = renderDescription(
    input.descriptionTemplate,
    input.title,
    input.specs,
    input.profileId,
  );

  const optionals = getPayloadOptionals(input.profileId);
  const raw: Record<string, unknown> = {
    title: truncateOlxTitle(input.title),
    category_id: input.olxCategoryId,
    description,
    price: input.price,
    listing_type: "sell",
    state: "new",
    available: false,
  };

  if (optionals.includePriceByAgreement) {
    raw.price_by_agreement = false;
  }
  if (optionals.includeQuantity) {
    raw.quantity = 1;
  }
  if (input.attributes.length > 0) {
    raw.attributes = input.attributes;
  }

  return permuteObjectKeys(raw, input.profileId) as CreateListingPayload;
}
