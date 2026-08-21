/**
 * Audit OLX required attributes vs DB mappings for postable categories.
 * Run: npx tsx --env-file=.env.local scripts/audit-olx-required-attrs.ts
 */
import "./_olx-guard";

import { OlxClient } from "@/lib/olx/client";
import { createAdminClient } from "@/lib/supabase/admin";

async function main() {
  const username = process.env.OLX_USERNAME;
  const password = process.env.OLX_PASSWORD;
  if (!username || !password) {
    throw new Error("OLX_USERNAME / OLX_PASSWORD required");
  }

  const client = new OlxClient();
  await client.login(username, password);
  const admin = createAdminClient();

  const { data: categories, error } = await admin
    .from("categories")
    .select("id, internal_slug, olx_category_id, is_postable")
    .eq("is_postable", true)
    .not("olx_category_id", "is", null)
    .order("internal_slug");

  if (error) throw error;

  const missing: string[] = [];

  for (const cat of categories ?? []) {
    const olxId = cat.olx_category_id!;
    const attrs = await client.getCategoryAttributes(olxId);
    const required = attrs.filter((a) => a.required);

    const { data: mappings } = await admin
      .from("attribute_mappings")
      .select("olx_attribute_id, required, fallback_value")
      .eq("category_id", cat.id);

    const mappedIds = new Set((mappings ?? []).map((m) => m.olx_attribute_id));

    for (const req of required) {
      const mapping = (mappings ?? []).find((m) => m.olx_attribute_id === req.id);
      if (!mappedIds.has(req.id)) {
        missing.push(
          `${cat.internal_slug} (#${olxId}): MISSING mapping for #${req.id} ${req.display_name}`,
        );
      } else if (!mapping?.fallback_value && mapping?.required) {
        // mapped but no fallback - might fail on empty specs
        const hasFeedMapping = true; // optional check
        if (hasFeedMapping) {
          missing.push(
            `${cat.internal_slug}: #${req.id} ${req.display_name} mapped but no fallback (options: ${JSON.stringify(req.options?.slice(0, 4))})`,
          );
        }
      }
    }
  }

  console.log(`Checked ${categories?.length ?? 0} postable categories`);
  if (missing.length === 0) {
    console.log("No missing required attribute mappings.");
    return;
  }
  console.log(`\n${missing.length} issue(s):\n`);
  for (const line of missing) console.log(line);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
