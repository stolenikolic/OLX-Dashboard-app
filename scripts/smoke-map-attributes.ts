/**
 * Dry-run mapProductAttributes against live DB for sample products.
 * Run: npx tsx --env-file=.env.local scripts/smoke-map-attributes.ts
 */
import { createAdminClient } from "../lib/supabase/admin";
import { mapProductAttributes } from "../lib/listings/map-attributes";

const SLUGS = [
  "graficke-kartice",
  "maticne-ploce",
  "ram",
  "ssd",
  "kucista",
  "napajanja",
  "vazudsna-hladjenja",
  "misevi",
  "monitori",
  "nas-uredjaji",
  "tastature",
  "serveri",
];

async function main() {
  const admin = createAdminClient();

  const { data: serveri } = await admin
    .from("categories")
    .select("is_postable")
    .eq("internal_slug", "serveri")
    .single();
  if (serveri && serveri.is_postable !== false) {
    throw new Error("serveri should be is_postable=false");
  }
  console.log("serveri is_postable=false: ok");

  for (const slug of SLUGS) {
    if (slug === "serveri") continue;

    const { data: cat, error: catErr } = await admin
      .from("categories")
      .select("id, internal_slug, is_postable")
      .eq("internal_slug", slug)
      .single();
    if (catErr || !cat) {
      console.log(`skip ${slug}: no category`);
      continue;
    }

    const { data: products } = await admin
      .from("products")
      .select("id, title, specs")
      .eq("category_slug", slug)
      .eq("in_feed", true)
      .limit(2);

    const samples = products ?? [];
    // Also test empty specs
    const emptySpecs: Record<string, unknown> = {};
    const attrsEmpty = await mapProductAttributes(admin, cat.id, emptySpecs);
    console.log(
      `${slug} (empty specs): ${attrsEmpty.length} attrs → ${JSON.stringify(attrsEmpty)}`,
    );
    if (attrsEmpty.length === 0 && cat.is_postable) {
      // categories with no required attrs are fine
      const { count } = await admin
        .from("attribute_mappings")
        .select("id", { count: "exact", head: true })
        .eq("category_id", cat.id)
        .eq("required", true);
      if ((count ?? 0) > 0) {
        throw new Error(`${slug}: required mappings but empty attrs produced`);
      }
    }

    for (const p of samples) {
      const specs = (p.specs ?? {}) as Record<string, unknown>;
      const attrs = await mapProductAttributes(admin, cat.id, specs);
      console.log(
        `  ${slug} sample "${p.title.slice(0, 40)}…": ${attrs.length} attrs`,
      );
    }
  }

  console.log("\nmapProductAttributes dry-run done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
