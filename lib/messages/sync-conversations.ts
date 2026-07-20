import type { SupabaseClient } from "@supabase/supabase-js";

import { randomDelayMs, sleep } from "@/lib/listings/post-queue";
import type { OlxConversation } from "@/lib/olx/types";
import { handleOlxAuthFailure, isAuthFailure } from "@/lib/olx/suspension";
import { notifyJobFailed } from "@/lib/notify/email";
import {
  createClientForProfile,
  loadProfileForWorker,
} from "@/lib/workers/profile";
import { appendJobLog, finishJobRun, startJobRun } from "@/lib/workers/job-log";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

const PAGE_SIZE = 15;
const DELAY_MIN_MS = 300;
const DELAY_MAX_MS = 800;
const DEFAULT_BACKFILL_MONTHS = 12;

export type SyncConversationsOptions = {
  profileId: string;
  /** Ako je setovano, backfill do N mjeseci unazad. Inače inkrementalno. */
  backfillMonths?: number;
  dryRun?: boolean;
  jobRunId?: string;
  /** Safety cap na broj stranica (env SYNC_CONVERSATIONS_MAX_PAGES). */
  maxPages?: number;
};

export type SyncConversationsResult = {
  pages: number;
  scanned: number;
  upserted: number;
  systemSkipped: number;
  stoppedReason: string;
};

function unixToIso(unix: number | null | undefined): string | null {
  if (unix == null || !Number.isFinite(unix) || unix <= 0) return null;
  return new Date(unix * 1000).toISOString();
}

function isSystemConversation(conv: OlxConversation): boolean {
  const hasListing = conv.listing != null && conv.listing.id != null;
  const senderType = conv.sender?.type;
  if (hasListing && senderType === "user") return false;
  if (!hasListing && senderType !== "user") return true;
  // listing=null with user sender is rare — treat as system for scoring
  if (!hasListing) return true;
  return false;
}

function mapConversationRow(
  profileId: string,
  conv: OlxConversation,
): Database["public"]["Tables"]["conversations"]["Insert"] {
  const system = isSystemConversation(conv);
  return {
    profile_id: profileId,
    olx_conversation_id: conv.id,
    buyer_id: conv.sender?.id && conv.sender.id > 0 ? conv.sender.id : null,
    buyer_username: conv.sender?.username ?? null,
    olx_listing_id: conv.listing?.id ?? null,
    listing_title: conv.listing?.title ?? null,
    olx_category_id: conv.listing?.category?.id ?? null,
    last_message_type: conv.last_message?.type ?? null,
    last_message_at: unixToIso(conv.updated_at),
    inquiry_at: unixToIso(conv.created_at),
    unread_count: conv.unread_messages ?? 0,
    is_system: system,
    saved: conv.saved === true,
    buyer_avatar: conv.sender?.avatar ?? null,
    synced_at: new Date().toISOString(),
  };
}

async function getWatermark(
  admin: Admin,
  profileId: string,
): Promise<Date | null> {
  const { data, error } = await admin
    .from("conversations")
    .select("last_message_at")
    .eq("profile_id", profileId)
    .not("last_message_at", "is", null)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Watermark upita nije uspio: ${error.message}`);
  }
  return data?.last_message_at ? new Date(data.last_message_at) : null;
}

export async function runSyncConversationsWorker(
  admin: Admin,
  options: SyncConversationsOptions,
): Promise<SyncConversationsResult> {
  const profile = await loadProfileForWorker(admin, options.profileId);
  const dryRun = options.dryRun ?? false;
  const backfillMonths = options.backfillMonths;
  const maxPages =
    options.maxPages ??
    (process.env.SYNC_CONVERSATIONS_MAX_PAGES
      ? Number(process.env.SYNC_CONVERSATIONS_MAX_PAGES)
      : null);

  const result: SyncConversationsResult = {
    pages: 0,
    scanned: 0,
    upserted: 0,
    systemSkipped: 0,
    stoppedReason: "end",
  };

  const olx = await createClientForProfile(admin, profile);

  const cutoff =
    backfillMonths != null
      ? new Date(
          Date.now() - backfillMonths * 30.44 * 24 * 60 * 60 * 1000,
        )
      : null;

  const watermark =
    backfillMonths == null ? await getWatermark(admin, profile.id) : null;

  console.log(
    `Sync conversations: profile=${profile.name}` +
      (backfillMonths != null
        ? ` backfill=${backfillMonths}mj`
        : watermark
          ? ` incremental since ${watermark.toISOString()}`
          : " full (nema watermark)"),
  );

  let page = 1;
  let stop = false;

  while (!stop) {
    let pageData: OlxConversation[];
    try {
      const res = await olx.getConversations(page);
      pageData = res.data ?? [];
    } catch (err) {
      if (isAuthFailure(err)) {
        await handleOlxAuthFailure(admin, profile.id, profile.name, err);
      }
      throw err;
    }

    result.pages++;

    if (pageData.length === 0) {
      result.stoppedReason = "empty_page";
      break;
    }

    let pageMaxUpdated = 0;
    let pageMinUpdated = Number.POSITIVE_INFINITY;
    const rows: Database["public"]["Tables"]["conversations"]["Insert"][] = [];

    for (const conv of pageData) {
      result.scanned++;
      if (conv.updated_at > pageMaxUpdated) pageMaxUpdated = conv.updated_at;
      if (conv.updated_at < pageMinUpdated) pageMinUpdated = conv.updated_at;

      const row = mapConversationRow(profile.id, conv);
      if (row.is_system) result.systemSkipped++;
      rows.push(row);
    }

    if (!dryRun && rows.length > 0) {
      const { error } = await admin.from("conversations").upsert(rows, {
        onConflict: "profile_id,olx_conversation_id",
      });
      if (error) {
        throw new Error(`Upsert conversations nije uspio: ${error.message}`);
      }
      result.upserted += rows.length;
    } else if (dryRun) {
      result.upserted += rows.length;
    }

    const pageMaxDate = new Date(pageMaxUpdated * 1000);
    const pageMinDate = new Date(pageMinUpdated * 1000);

    console.log(
      `Conversations page ${page}: n=${pageData.length}, ` +
        `range=${pageMinDate.toISOString().slice(0, 10)}..${pageMaxDate.toISOString().slice(0, 10)}, ` +
        `upserted=${result.upserted}`,
    );

    // Stop conditions
    if (cutoff && pageMaxDate < cutoff) {
      // Whole page older than cutoff
      result.stoppedReason = "backfill_cutoff";
      stop = true;
    } else if (watermark && pageMaxDate < watermark) {
      result.stoppedReason = "watermark";
      stop = true;
    } else if (pageData.length < PAGE_SIZE) {
      result.stoppedReason = "last_page";
      stop = true;
    } else if (maxPages != null && Number.isFinite(maxPages) && page >= maxPages) {
      result.stoppedReason = "max_pages";
      stop = true;
    } else {
      page++;
      await sleep(randomDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));
    }
  }

  return result;
}

export async function runSyncConversationsJob(
  admin: Admin,
  profileId: string,
  options?: { dryRun?: boolean; backfillMonths?: number },
): Promise<SyncConversationsResult> {
  const profile = await loadProfileForWorker(admin, profileId);
  const jobRunId = await startJobRun(admin, {
    job: "sync_conversations",
    profileId,
  });
  const startedAt = Date.now();

  try {
    const stats = await runSyncConversationsWorker(admin, {
      profileId,
      dryRun: options?.dryRun,
      backfillMonths: options?.backfillMonths,
      jobRunId,
    });
    const durationMs = Date.now() - startedAt;
    const summary =
      `Stranica=${stats.pages}; skenirano=${stats.scanned}; ` +
      `upsert=${stats.upserted}; sistemskih=${stats.systemSkipped}; ` +
      `stop=${stats.stoppedReason}.`;

    await finishJobRun(admin, jobRunId, {
      status: "success",
      items_processed: stats.scanned,
      items_succeeded: stats.upserted,
      items_failed: 0,
      summary,
    });

    await appendJobLog(admin, jobRunId, {
      level: "info",
      message: "sync_conversations završen",
      context: { ...stats, durationMs } as unknown as Json,
    });

    return stats;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishJobRun(admin, jobRunId, {
      status: "failed",
      summary: message,
    });
    await appendJobLog(admin, jobRunId, {
      level: "error",
      message: "sync_conversations neuspješan",
      context: { error: message },
    });
    await notifyJobFailed("sync_conversations", profile.name, message);
    throw err;
  }
}

export { DEFAULT_BACKFILL_MONTHS };
