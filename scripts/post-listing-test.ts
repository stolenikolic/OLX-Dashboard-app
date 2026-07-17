import { ensureTechZoneProfile } from "@/lib/listings/ensure-profile";
import { postProductListing } from "@/lib/listings/post-listing";
import { OlxClient } from "@/lib/olx/client";
import { createAdminClient } from "@/lib/supabase/admin";

/** AMD Ryzen 5 9600 — jedan test artikal iz kategorije procesori. */
const TEST_FEED_UUID =
  process.env.TEST_FEED_UUID ?? "065d83f1-e74a-4a58-be37-aabaadbf1818";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const publish = process.argv.includes("--publish");

  if (!dryRun && !publish) {
    console.log(
      "Koristi --dry-run (prikaži payload) ili --publish (objavi na OLX).\n" +
        "Primjer: npm run post:listing:dry",
    );
    process.exit(1);
  }

  const username = process.env.OLX_USERNAME;
  const password = process.env.OLX_PASSWORD;
  if (!username || !password) {
    throw new Error("OLX_USERNAME / OLX_PASSWORD nisu postavljeni.");
  }

  const admin = createAdminClient();
  const profileId = await ensureTechZoneProfile(admin);

  const { data: product, error: productError } = await admin
    .from("products")
    .select("id, title, feed_uuid")
    .eq("feed_uuid", TEST_FEED_UUID)
    .single();

  if (productError || !product) {
    throw new Error(
      `Test proizvod ${TEST_FEED_UUID} nije u bazi. Pokreni npm run sync:feed.`,
    );
  }

  console.log(`Profil: ${profileId}`);
  console.log(`Proizvod: ${product.title} (${product.feed_uuid})`);

  const client = new OlxClient({
    deviceName: process.env.OLX_DEVICE_NAME ?? "api_integration",
  });

  if (!dryRun) {
    await client.login(username, password);
    console.log("OLX login OK.");
  }

  const result = await postProductListing(admin, {
    profileId,
    productId: product.id,
    client,
    dryRun,
  });

  if (!result.ok) {
    console.log(
      `Preskočeno — već postoji oglas (OLX #${result.olxListingId ?? "?"}).`,
    );
    return;
  }

  if (result.dryRun) {
    console.log("\n--- DRY RUN payload ---");
    console.log(JSON.stringify(result.payload, null, 2));
    console.log(`\nCijena: ${result.price} KM`);
    console.log("\nZa stvarno objavljivanje: npm run post:listing:publish");
    return;
  }

  console.log(`\nObjavljeno! OLX listing #${result.olxListingId}, cijena ${result.price} KM`);
  console.log(`DB zapis: listings.id = ${result.listingRowId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
