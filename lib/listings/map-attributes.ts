import type { SupabaseClient } from "@supabase/supabase-js";

import {
  transformSpecValue,
  withDerivedSpecs,
} from "@/lib/listings/transform-spec";
import type { OlxListingAttribute } from "@/lib/olx/types";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

type MappingRow = {
  id: string;
  spec_key: string;
  olx_attribute_id: number;
  required: boolean;
  fallback_value: string | null;
  attribute_value_mappings: Array<{
    feed_value: string;
    olx_value: string;
  }>;
};

export async function mapProductAttributes(
  admin: Admin,
  categoryId: string,
  specs: Record<string, unknown>,
): Promise<OlxListingAttribute[]> {
  const { data, error } = await admin
    .from("attribute_mappings")
    .select(
      `
      id,
      spec_key,
      olx_attribute_id,
      required,
      fallback_value,
      attribute_value_mappings (
        feed_value,
        olx_value
      )
    `,
    )
    .eq("category_id", categoryId);

  if (error) {
    throw new Error(`Učitavanje attribute_mappings nije uspjelo: ${error.message}`);
  }

  const mappings = (data ?? []) as MappingRow[];
  const attributes: OlxListingAttribute[] = [];
  const effectiveSpecs = withDerivedSpecs(specs);

  for (const m of mappings) {
    const raw = effectiveSpecs[m.spec_key];
    const feedStr = raw != null ? String(raw).trim() : "";

    const valueMap = new Map(
      (m.attribute_value_mappings ?? []).map((v) => [v.feed_value, v.olx_value]),
    );

    let olxValue: string | null = null;

    if (feedStr && valueMap.has(feedStr)) {
      olxValue = valueMap.get(feedStr)!;
    } else if (feedStr) {
      olxValue = transformSpecValue(m.spec_key, raw);
    } else if (m.fallback_value) {
      olxValue = m.fallback_value;
    } else if (m.required) {
      throw new Error(
        `Obavezan atribut "${m.spec_key}" (#${m.olx_attribute_id}) nema vrijednost u feed-u.`,
      );
    }

    if (olxValue != null && olxValue !== "") {
      attributes.push({ id: m.olx_attribute_id, value: olxValue });
    }
  }

  return attributes;
}
