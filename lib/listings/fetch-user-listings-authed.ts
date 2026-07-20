import { randomDelayMs, sleep } from "@/lib/listings/post-queue";
import type { OlxClient } from "@/lib/olx/client";
import type { OlxUserListing } from "@/lib/olx/types";

export type AuthedOlxListing = {
  id: number;
  title: string;
  categoryId: number;
  price: number;
  status: string;
  refreshAvailable: boolean;
  /** Unix seconds from OLX `date` field. */
  date: number | null;
};

const PER_PAGE = 1000;
/** Elasticsearch-style max_result_window — page*per_page beyond ~10k returns 500. */
const MAX_SAFE_PAGE = 10;
const DELAY_MIN_MS = 300;
const DELAY_MAX_MS = 800;

/**
 * Povlači sve aktivne oglase preko autentifikovanog
 * `/users/:username/listings` (uključuje `refresh_available`).
 *
 * Koristi desc + asc (kao search) jer OLX lomi nakon ~10k offseta.
 */
export async function fetchAllUserListingsAuthed(
  client: OlxClient,
  username: string,
): Promise<Map<number, AuthedOlxListing>> {
  const byId = new Map<number, AuthedOlxListing>();

  const first = await client.getUserListingsAuthed(
    username,
    1,
    PER_PAGE,
    "desc",
  );
  const total = first.meta?.total ?? first.data.length;

  for (const row of first.data) {
    byId.set(row.id, mapRow(row));
  }
  console.log(
    `OLX authed [desc] page 1: +${first.data.length}, ukupno=${byId.size}/${total}`,
  );

  await pullDirection(client, username, "desc", byId, total);

  if (byId.size < total) {
    console.log(
      `OLX authed: nedostaje ${total - byId.size} — reverse asc…`,
    );
    await pullDirection(client, username, "asc", byId, total);
  }

  if (byId.size < total) {
    console.warn(
      `OLX authed: prikupljeno ${byId.size}/${total} (moguća razlika zbog ES window / brisanja).`,
    );
  } else {
    console.log(`OLX authed: kompletno ${byId.size}/${total}`);
  }

  return byId;
}

async function pullDirection(
  client: OlxClient,
  username: string,
  sortOrder: "asc" | "desc",
  byId: Map<number, AuthedOlxListing>,
  targetTotal: number,
): Promise<void> {
  const startPage = sortOrder === "desc" ? 2 : 1;

  for (let page = startPage; page <= MAX_SAFE_PAGE; page++) {
    if (targetTotal > 0 && byId.size >= targetTotal) break;

    await sleep(randomDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));

    let res;
    try {
      res = await client.getUserListingsAuthed(
        username,
        page,
        PER_PAGE,
        sortOrder,
      );
    } catch (err) {
      console.warn(
        `OLX authed [${sortOrder}] page ${page} failed: ` +
          (err instanceof Error ? err.message : String(err)),
      );
      break;
    }

    let added = 0;
    for (const row of res.data) {
      if (!byId.has(row.id)) added++;
      byId.set(row.id, mapRow(row));
    }

    console.log(
      `OLX authed [${sortOrder}] page ${page}: +${added}, ukupno=${byId.size}/${targetTotal}`,
    );

    if (res.data.length === 0) break;
    if (added === 0 && sortOrder === "asc" && page >= 3) break;
    if (targetTotal > 0 && byId.size >= targetTotal) break;
  }
}

function mapRow(row: OlxUserListing): AuthedOlxListing {
  return {
    id: row.id,
    title: row.title ?? "",
    categoryId: row.category_id ?? 0,
    price: typeof row.price === "number" ? row.price : Number(row.price) || 0,
    status: row.status ?? "active",
    refreshAvailable: row.refresh_available === true,
    date: typeof row.date === "number" ? row.date : null,
  };
}
