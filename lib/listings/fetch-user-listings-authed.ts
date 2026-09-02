import type { SupabaseClient } from "@supabase/supabase-js";

import { randomDelayMs, sleep } from "@/lib/listings/post-queue";
import type { OlxClient } from "@/lib/olx/client";
import type { OlxUserListing } from "@/lib/olx/types";
import { paginationForProfile } from "@/lib/profile/pagination";
import { appendJobLog } from "@/lib/workers/job-log";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

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

/**
 * NAPOMENA (probe 2026-09-02, scripts/probe-olx-user-listings.ts na GHA):
 * `/users/:username/listings` NE poštuje `price_from`/`price_to` ni
 * `selected_category` — oba parametra su tiho ignorisana (identičan
 * neisfiltriran total i identičan skup redova bez obzira na filter,
 * potvrđeno na nalogu sa 17.362 oglasa razbacanih kroz 20+ kategorija).
 * `page × per_page > 10.000` vraća HTTP 500 (potvrđena ES window granica).
 *
 * Zato — za razliku od javnog search API-ja (lib/olx/search-user-listings.ts)
 * — particionisanje preko cjenovnih pragova/kategorija NIJE moguće na ovom
 * endpointu. Ostaje desc+asc obilazak (plafon ~20k po nalogu). Ako OLX u
 * budućnosti popravi ova dva parametra, probe skriptu treba ponovo pokrenuti
 * prije nego se ovdje uvede bucket particionisanje.
 */
const ES_LIMIT = 10_000;

/**
 * Povlači sve aktivne oglase preko autentifikovanog
 * `/users/:username/listings` (uključuje `refresh_available`).
 *
 * Koristi desc + asc jer OLX vraća HTTP 500 nakon ~10k offseta, a filter po
 * cijeni/kategoriji ovaj endpoint ne podržava (vidi napomenu iznad).
 */
export async function fetchAllUserListingsAuthed(
  client: OlxClient,
  username: string,
  profileId: string,
  pacing: { minMs: number; maxMs: number },
  coverage?: { admin: Admin; jobRunId: string; profileName: string },
): Promise<Map<number, AuthedOlxListing>> {
  const { perPage, maxPage } = paginationForProfile(profileId);
  const byId = new Map<number, AuthedOlxListing>();

  const first = await client.getUserListingsAuthed(username, 1, perPage, "desc");
  const total = first.meta?.total ?? first.data.length;

  for (const row of first.data) {
    byId.set(row.id, mapRow(row));
  }
  console.log(
    `OLX authed [desc] page 1: +${first.data.length}, ukupno=${byId.size}/${total}`,
  );

  await pullDirection(client, username, "desc", byId, total, perPage, maxPage, pacing);

  if (byId.size < total) {
    console.log(`OLX authed: nedostaje ${total - byId.size} — reverse asc…`);
    await pullDirection(client, username, "asc", byId, total, perPage, maxPage, pacing);
  }

  if (byId.size < total && total > ES_LIMIT * 2) {
    // Cijeli nalog prelazi ~20k, desc+asc plafon — ovaj endpoint nema
    // partitioning mehanizam (potvrđeno probe-om) da se to premosti.
    const message =
      `OLX authed nepotpun uvoz: prikupljeno ${byId.size}/${total} kod naloga koji ` +
      `prelazi ~${ES_LIMIT * 2} (desc+asc plafon ovog endpointa). refresh_available ` +
      `za nedostajuće oglase nije dostupan ovim putem.`;
    console.warn(message);
    if (coverage) {
      await appendJobLog(coverage.admin, coverage.jobRunId, {
        level: "warn",
        message,
        context: { collected: byId.size, total, profile: coverage.profileName } as Json,
      });
    }
  } else if (byId.size < total) {
    console.warn(
      `OLX authed: prikupljeno ${byId.size}/${total} (moguća razlika zbog brisanja oglasa tokom obilaska).`,
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
  perPage: number,
  maxPage: number,
  pacing: { minMs: number; maxMs: number },
): Promise<void> {
  const startPage = sortOrder === "desc" ? 2 : 1;

  for (let page = startPage; page <= maxPage; page++) {
    if (targetTotal > 0 && byId.size >= targetTotal) break;

    await sleep(randomDelayMs(pacing.minMs, pacing.maxMs));

    let res;
    try {
      res = await client.getUserListingsAuthed(username, page, perPage, sortOrder);
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
