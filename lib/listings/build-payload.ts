import { renderDescription } from "@/lib/listings/description";
import type { OlxListingAttribute } from "@/lib/olx/types";
import type { CreateListingPayload } from "@/lib/olx/types";

const OLX_TITLE_MAX = 65;

export function truncateOlxTitle(title: string): string {
  const t = title.trim();
  if (t.length <= OLX_TITLE_MAX) return t;
  const cut = t.slice(0, OLX_TITLE_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > OLX_TITLE_MAX * 0.6) {
    return cut.slice(0, lastSpace).trim();
  }
  return cut.trim();
}

export type ListingBuildInput = {
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
  );

  return {
    title: truncateOlxTitle(input.title),
    category_id: input.olxCategoryId,
    description,
    price: input.price,
    listing_type: "sell",
    state: "new",
    price_by_agreement: false,
    quantity: 1,
    available: true,
    attributes: input.attributes,
  };
}
