import { writeFileSync } from "node:fs";
import path from "node:path";

const USER_ID = Number(process.env.OLX_USER_ID ?? "261905");
const PER_PAGE = 1000;
const MAX_PAGE = 10; // ES window
const DELAY_MS = 120;

type SearchAd = {
  id: number;
  title: string;
};

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchSearchPage(
  page: number,
  sortOrder: "asc" | "desc",
): Promise<{ ads: SearchAd[]; total: number; lastPage: number }> {
  const params = new URLSearchParams({
    attr: "",
    attr_encoded: "1",
    page: String(page),
    sort_by: "date",
    sort_order: sortOrder,
    user_id: String(USER_ID),
    per_page: String(PER_PAGE),
  });

  const url = `https://olx.ba/api/search?${params}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} za page=${page} sort=${sortOrder}`);
  }

  const json = (await res.json()) as {
    data?: Array<{ id: number; title?: string }>;
    meta?: { total?: number; last_page?: number };
  };

  const ads = (json.data ?? []).map((row) => ({
    id: row.id,
    title: row.title ?? "",
  }));

  return {
    ads,
    total: json.meta?.total ?? 0,
    lastPage: json.meta?.last_page ?? 1,
  };
}

async function pullDirection(
  sortOrder: "asc" | "desc",
  byId: Map<number, string>,
  targetTotal: number,
): Promise<void> {
  for (let page = 1; page <= MAX_PAGE; page++) {
    if (byId.size >= targetTotal && targetTotal > 0) break;

    const { ads, total, lastPage } = await fetchSearchPage(page, sortOrder);
    let added = 0;
    for (const ad of ads) {
      if (!byId.has(ad.id)) added++;
      byId.set(ad.id, ad.title);
    }

    console.log(
      `[${sortOrder}] page ${page}/${Math.min(lastPage, MAX_PAGE)}: +${added}, ukupno=${byId.size}/${total}`,
    );

    if (ads.length === 0 || page >= lastPage) break;
    await sleep(DELAY_MS);
  }
}

async function main() {
  const outPath =
    process.env.OUT_CSV?.trim() ||
    path.join(
      process.env.USERPROFILE ?? process.env.HOME ?? ".",
      "Desktop",
      "techzone_olx_listings.csv",
    );

  console.log(`OLX search export user_id=${USER_ID}…`);
  const byId = new Map<number, string>();

  const first = await fetchSearchPage(1, "desc");
  const targetTotal = first.total;
  for (const ad of first.ads) byId.set(ad.id, ad.title);
  console.log(`[desc] page 1: +${first.ads.length}, ukupno=${byId.size}/${targetTotal}`);

  for (let page = 2; page <= MAX_PAGE; page++) {
    if (byId.size >= targetTotal) break;
    const { ads, lastPage } = await fetchSearchPage(page, "desc");
    let added = 0;
    for (const ad of ads) {
      if (!byId.has(ad.id)) added++;
      byId.set(ad.id, ad.title);
    }
    console.log(
      `[desc] page ${page}: +${added}, ukupno=${byId.size}/${targetTotal}`,
    );
    if (ads.length === 0 || page >= lastPage) break;
    await sleep(DELAY_MS);
  }

  if (byId.size < targetTotal) {
    console.log(`Nedostaje ${targetTotal - byId.size} — reverse asc…`);
    await pullDirection("asc", byId, targetTotal);
  }

  const rows = [...byId.entries()].sort((a, b) => a[0] - b[0]);
  const lines = ["olx_id,title"];
  for (const [id, title] of rows) {
    lines.push(`${id},${csvEscape(title)}`);
  }
  writeFileSync(outPath, lines.join("\n") + "\n", "utf8");

  console.log(`Gotovo: ${rows.length}/${targetTotal} → ${outPath}`);
  if (rows.length < targetTotal) {
    console.warn("Nije kompletno — provjeri log.");
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
