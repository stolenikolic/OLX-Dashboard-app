import { createAdminClient } from "@/lib/supabase/admin";
import { calculatePrice, type OfferInput } from "@/lib/pricing";
import {
  defaultProfilePricing,
  loadGlobalPricing,
} from "@/lib/pricing/context";

function fmt(n: number | null): string {
  if (n == null) return "—";
  return n.toFixed(2);
}

function printResult(
  label: string,
  result: ReturnType<typeof calculatePrice>,
  offers: OfferInput[],
) {
  console.log(`\n--- ${label} ---`);
  console.log(
    `  Ponude: ${offers.map((o) => `${o.origin}=${o.acquisition_price}`).join(", ")}`,
  );
  console.log(
    `  HUF std=${fmt(result.breakdown.hufStandard)} import=${fmt(result.breakdown.hufImport)} → ${fmt(result.breakdown.hufChosen)}${result.wasImport ? " (uvoz)" : ""}`,
  );
  console.log(`  BiH=${fmt(result.breakdown.bih)}`);
  console.log(
    `  → origin=${result.origin} base=${result.basePrice} KM final=${result.finalPrice} KM` +
      (result.variancePct != null
        ? ` (var ${(result.variancePct * 100).toFixed(2)}%)`
        : ""),
  );
}

async function main() {
  const admin = createAdminClient();
  const global = await loadGlobalPricing(admin);

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, kurs, kurs_uvoz")
    .limit(1);

  const profile =
    profiles?.[0] != null
      ? {
          kurs: Number(profiles[0].kurs),
          kurs_uvoz: Number(profiles[0].kurs_uvoz),
        }
      : defaultProfilePricing();

  const profileLabel =
    profiles?.[0] != null
      ? `${profiles[0].name} (KURS=${profile.kurs}, kurs_uvoz=${profile.kurs_uvoz})`
      : `default (KURS=${profile.kurs}, kurs_uvoz=${profile.kurs_uvoz})`;

  console.log("Pricing demo");
  console.log(`Profil: ${profileLabel}`);
  console.log(
    `Global: EUR=${global.eur_factor} PDV=${global.pdv_factor} random=${global.random_pct_min * 100}–${global.random_pct_max * 100}%`,
  );

  // PRD primjer iz razgovora (ARCTIC cooler)
  const prdExample: OfferInput[] = [
    { origin: "HUF", acquisition_price: 28750 },
    { origin: "BIH", acquisition_price: 250 },
  ];
  const prdCategory = { marza_huf: 1.1, marza_bih: 1.1, import_flag: false };

  printResult(
    "PRD primjer (28750 HUF + 250 KM, marza 1.1)",
    calculatePrice({
      offers: prdExample,
      category: prdCategory,
      product: { import_override: "inherit" },
      profile,
      global,
      applyVariance: false,
    }),
    prdExample,
  );

  // Isti primjer sa uvozom
  printResult(
    "PRD primjer — uvozni HUF",
    calculatePrice({
      offers: prdExample,
      category: { ...prdCategory, import_flag: true },
      product: { import_override: "inherit" },
      profile,
      global,
      applyVariance: false,
    }),
    prdExample,
  );

  // Uzorkuj proizvode iz baze: prvo sa obje ponude, pa samo HUF
  const { data: dualProducts } = await admin
    .from("products")
    .select(
      `
      id,
      title,
      import_override,
      categories ( marza_huf, marza_bih, import_flag ),
      product_offers ( origin, acquisition_price )
    `,
    )
    .eq("in_feed", true)
    .limit(200);

  type Row = NonNullable<typeof dualProducts>[number];

  function hasBoth(p: Row) {
    const origins = new Set((p.product_offers ?? []).map((o) => o.origin));
    return origins.has("HUF") && origins.has("BIH");
  }

  function hasHufOnly(p: Row) {
    const offers = p.product_offers ?? [];
    return offers.length === 1 && offers[0]?.origin === "HUF";
  }

  const dual = (dualProducts ?? []).find(hasBoth);
  const hufOnly = (dualProducts ?? []).find(hasHufOnly);

  for (const p of [dual, hufOnly].filter(Boolean) as Row[]) {
    const category = p.categories
      ? {
          marza_huf: Number(p.categories.marza_huf),
          marza_bih: Number(p.categories.marza_bih),
          import_flag: p.categories.import_flag,
        }
      : { marza_huf: 1.1, marza_bih: 1.1, import_flag: false };

    const offers: OfferInput[] = (p.product_offers ?? []).map((o) => ({
      origin: o.origin,
      acquisition_price: Number(o.acquisition_price),
    }));

    printResult(
      p.title.slice(0, 60),
      calculatePrice({
        offers,
        category,
        product: { import_override: p.import_override },
        profile,
        global,
        applyVariance: true,
        rng: () => 0.5,
      }),
      offers,
    );
  }

  if (!dual && !hufOnly) {
    console.log("\n(Nema uzorkovanih proizvoda iz baze — feed možda prazan.)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
