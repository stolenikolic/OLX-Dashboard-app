import type { SupabaseClient } from "@supabase/supabase-js";

import { randomDelayMs, sleep } from "@/lib/listings/post-queue";
import type { OlxMessage } from "@/lib/olx/types";
import { handleOlxAuthFailure, isAuthFailure } from "@/lib/olx/suspension";
import { notifyJobFailed } from "@/lib/notify/email";
import {
  createClientForProfile,
  ensureOlxUserId,
  loadProfileForWorker,
} from "@/lib/workers/profile";
import { appendJobLog, finishJobRun, startJobRun } from "@/lib/workers/job-log";
import type { Database, Json } from "@/types/database";

type Admin = SupabaseClient<Database>;

const PAGE_SIZE = 15;
const DELAY_MIN_MS = 250;
const DELAY_MAX_MS = 700;
const DEFAULT_MAX_PAGES_PER_CONV = 1;

export type SyncMessagesOptions = {
  profileId: string;
  /** Explicit OLX conversation IDs (lazy load from UI). */
  conversationIds?: number[];
  /** Cron mode: only conversations with unread_count > 0. */
  onlyUnread?: boolean;
  /** Starting page (1 = newest). */
  page?: number;
  /** Max pages to fetch per conversation. */
  maxPagesPerConversation?: number;
  dryRun?: boolean;
  jobRunId?: string;
};

export type SyncMessagesResult = {
  conversations: number;
  scanned: number;
  upserted: number;
  failed: number;
};

function unixToIso(unix: number | null | undefined): string | null {
  if (unix == null || !Number.isFinite(unix) || unix <= 0) return null;
  return new Date(unix * 1000).toISOString();
}

function mapMessageRow(
  profileId: string,
  conversationRef: string,
  olxConversationId: number,
  olxListingId: number | null,
  olxUserId: number,
  msg: OlxMessage,
): Database["public"]["Tables"]["messages"]["Insert"] {
  const senderId = msg.sender_id ?? msg.sender?.id ?? null;
  const direction =
    senderId != null && senderId === olxUserId ? "out" : "in";

  return {
    profile_id: profileId,
    conversation_ref: conversationRef,
    olx_conversation_id: olxConversationId,
    olx_listing_id: olxListingId,
    olx_message_id: msg.id,
    type: msg.type ?? "text",
    status: msg.status ?? null,
    direction,
    sender_id: senderId,
    body: msg.content ?? "",
    data: msg as unknown as Json,
    sent_at: unixToIso(msg.created_at),
    is_read: true,
  };
}

type ConvTarget = {
  id: string;
  olx_conversation_id: number;
  olx_listing_id: number | null;
  buyer_avatar: string | null;
};

async function loadConversationTargets(
  admin: Admin,
  profileId: string,
  options: SyncMessagesOptions,
): Promise<ConvTarget[]> {
  if (options.conversationIds && options.conversationIds.length > 0) {
    const { data, error } = await admin
      .from("conversations")
      .select("id, olx_conversation_id, olx_listing_id, buyer_avatar")
      .eq("profile_id", profileId)
      .in("olx_conversation_id", options.conversationIds);

    if (error) {
      throw new Error(`Učitavanje konverzacija nije uspjelo: ${error.message}`);
    }
    return data ?? [];
  }

  let query = admin
    .from("conversations")
    .select("id, olx_conversation_id, olx_listing_id, buyer_avatar")
    .eq("profile_id", profileId)
    .eq("is_system", false)
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (options.onlyUnread !== false) {
    query = query.gt("unread_count", 0);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Učitavanje unread konverzacija nije uspjelo: ${error.message}`);
  }
  return data ?? [];
}

export async function runSyncMessagesWorker(
  admin: Admin,
  options: SyncMessagesOptions,
): Promise<SyncMessagesResult> {
  const profile = await loadProfileForWorker(admin, options.profileId);
  const dryRun = options.dryRun ?? false;
  const startPage = Math.max(1, options.page ?? 1);
  const maxPages =
    options.maxPagesPerConversation ?? DEFAULT_MAX_PAGES_PER_CONV;

  const result: SyncMessagesResult = {
    conversations: 0,
    scanned: 0,
    upserted: 0,
    failed: 0,
  };

  const olx = await createClientForProfile(admin, profile);
  const olxUserId = await ensureOlxUserId(admin, profile, olx);
  const targets = await loadConversationTargets(admin, profile.id, options);

  console.log(
    `Sync messages: profile=${profile.name} targets=${targets.length}` +
      (options.onlyUnread !== false && !options.conversationIds
        ? " (unread only)"
        : ""),
  );

  for (const conv of targets) {
    result.conversations++;
    try {
      let buyerAvatar = conv.buyer_avatar;
      const rows: Database["public"]["Tables"]["messages"]["Insert"][] = [];

      for (let page = startPage; page < startPage + maxPages; page++) {
        let pageData: OlxMessage[];
        try {
          const res = await olx.getConversationMessages(
            conv.olx_conversation_id,
            page,
          );
          pageData = res.data ?? [];
        } catch (err) {
          if (isAuthFailure(err)) {
            await handleOlxAuthFailure(admin, profile.id, profile.name, err);
          }
          throw err;
        }

        if (pageData.length === 0) break;

        for (const msg of pageData) {
          result.scanned++;
          const row = mapMessageRow(
            profile.id,
            conv.id,
            conv.olx_conversation_id,
            conv.olx_listing_id,
            olxUserId,
            msg,
          );
          rows.push(row);

          if (
            row.direction === "in" &&
            msg.sender?.avatar &&
            !buyerAvatar
          ) {
            buyerAvatar = msg.sender.avatar;
          }
        }

        if (pageData.length < PAGE_SIZE) break;
        await sleep(randomDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));
      }

      if (!dryRun && rows.length > 0) {
        const { error } = await admin.from("messages").upsert(rows, {
          onConflict: "profile_id,olx_message_id",
        });
        if (error) {
          throw new Error(`Upsert messages nije uspio: ${error.message}`);
        }
        result.upserted += rows.length;

        await admin
          .from("conversations")
          .update({
            messages_synced_at: new Date().toISOString(),
            ...(buyerAvatar ? { buyer_avatar: buyerAvatar } : {}),
            // Unread sync → unarhiviraj (nova aktivnost)
            ...(options.onlyUnread !== false && !options.conversationIds
              ? { archived: false }
              : {}),
          })
          .eq("id", conv.id);
      } else if (dryRun) {
        result.upserted += rows.length;
      }
    } catch (err) {
      result.failed++;
      console.error(
        `Sync messages failed for conv ${conv.olx_conversation_id}:`,
        err instanceof Error ? err.message : err,
      );
      if (isAuthFailure(err)) throw err;
    }

    await sleep(randomDelayMs(DELAY_MIN_MS, DELAY_MAX_MS));
  }

  return result;
}

export async function runSyncMessagesJob(
  admin: Admin,
  profileId: string,
  options?: {
    dryRun?: boolean;
    onlyUnread?: boolean;
    conversationIds?: number[];
  },
): Promise<SyncMessagesResult> {
  const profile = await loadProfileForWorker(admin, profileId);
  const jobRunId = await startJobRun(admin, {
    job: "sync_messages",
    profileId,
  });
  const startedAt = Date.now();

  try {
    const stats = await runSyncMessagesWorker(admin, {
      profileId,
      dryRun: options?.dryRun,
      onlyUnread: options?.onlyUnread ?? true,
      conversationIds: options?.conversationIds,
      jobRunId,
    });
    const durationMs = Date.now() - startedAt;
    const summary =
      `Konverzacija=${stats.conversations}; skenirano=${stats.scanned}; ` +
      `upsert=${stats.upserted}; greške=${stats.failed}.`;

    await finishJobRun(admin, jobRunId, {
      status: stats.failed > 0 && stats.upserted === 0 ? "failed" : "success",
      items_processed: stats.scanned,
      items_succeeded: stats.upserted,
      items_failed: stats.failed,
      summary,
    });

    await appendJobLog(admin, jobRunId, {
      level: "info",
      message: "sync_messages završen",
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
      message: "sync_messages neuspješan",
      context: { error: message },
    });
    await notifyJobFailed("sync_messages", profile.name, message);
    throw err;
  }
}
