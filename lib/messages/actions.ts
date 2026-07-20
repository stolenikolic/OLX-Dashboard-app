"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/dal";
import {
  createClientForProfileId,
} from "@/lib/listings/profile-client";
import { runSyncMessagesWorker } from "@/lib/messages/sync-messages";
import { fetchMessages } from "@/lib/messages/queries";
import { handleOlxAuthFailure, isAuthFailure } from "@/lib/olx/suspension";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  ensureOlxUserId,
  loadProfileForWorker,
} from "@/lib/workers/profile";
import type { Database, Json } from "@/types/database";

const SEND_THROTTLE_MS = 400;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getConversationForAction(conversationId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select(
      "id, profile_id, olx_conversation_id, buyer_id, buyer_username, olx_listing_id, listing_title, unread_count, saved, archived, messages_synced_at",
    )
    .eq("id", conversationId)
    .single();

  if (error || !data) {
    throw new Error("Konverzacija nije pronađena.");
  }
  return data;
}

function mapOlxMessageToRow(
  profileId: string,
  conversationRef: string,
  olxConversationId: number,
  olxListingId: number | null,
  olxUserId: number,
  msg: {
    id: number;
    type?: string;
    status?: string;
    content?: string;
    sender_id?: number;
    sender?: { id?: number };
    created_at: number;
    [k: string]: unknown;
  },
): Database["public"]["Tables"]["messages"]["Insert"] {
  const senderId = msg.sender_id ?? msg.sender?.id ?? null;
  return {
    profile_id: profileId,
    conversation_ref: conversationRef,
    olx_conversation_id: olxConversationId,
    olx_listing_id: olxListingId,
    olx_message_id: msg.id,
    type: msg.type ?? "text",
    status: msg.status ?? "sent",
    direction: senderId != null && senderId === olxUserId ? "out" : "in",
    sender_id: senderId,
    body: msg.content ?? "",
    data: msg as unknown as Json,
    sent_at: new Date(msg.created_at * 1000).toISOString(),
    is_read: true,
  };
}

const SYNC_STALE_MS = 2 * 60 * 1000;

export async function openConversationAction(conversationId: string) {
  await requireUser();
  const conv = await getConversationForAction(conversationId);
  const admin = createAdminClient();

  // Brzo lokalno: odmah makni unread badge
  if (conv.unread_count > 0) {
    await admin
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId);
  }

  const syncedAt = conv.messages_synced_at
    ? new Date(conv.messages_synced_at).getTime()
    : 0;
  const needsSync =
    conv.unread_count > 0 ||
    !syncedAt ||
    Date.now() - syncedAt > SYNC_STALE_MS;

  try {
    const client = await createClientForProfileId(conv.profile_id);

    if (needsSync) {
      await runSyncMessagesWorker(admin, {
        profileId: conv.profile_id,
        conversationIds: [conv.olx_conversation_id],
        onlyUnread: false,
        maxPagesPerConversation: 1,
      });
    }

    try {
      await client.markConversationSeen(conv.olx_conversation_id);
    } catch (err) {
      console.warn("markConversationSeen failed:", err);
    }
  } catch (err) {
    if (isAuthFailure(err)) {
      const profile = await loadProfileForWorker(admin, conv.profile_id);
      await handleOlxAuthFailure(admin, conv.profile_id, profile.name, err);
    }
    throw err;
  }

  revalidatePath("/poruke");
  revalidatePath("/");
}

export type SendMessageResult = {
  id: string;
  olx_message_id: number | null;
  body: string | null;
  type: string;
  status: string | null;
  direction: string;
  sent_at: string | null;
  data: Json | null;
};

export async function sendMessageAction(
  conversationId: string,
  content: string,
): Promise<SendMessageResult> {
  await requireUser();
  const text = content.trim();
  if (!text) throw new Error("Poruka je prazna.");
  if (text.length > 5000) throw new Error("Poruka je predugačka.");

  const conv = await getConversationForAction(conversationId);
  if (!conv.buyer_id) {
    throw new Error("Konverzacija nema kupca (receiver_id).");
  }

  const admin = createAdminClient();
  const profile = await loadProfileForWorker(admin, conv.profile_id);

  try {
    const client = await createClientForProfileId(conv.profile_id);
    const olxUserId = await ensureOlxUserId(admin, profile, client);

    await sleep(SEND_THROTTLE_MS);

    const sender = {
      id: olxUserId,
      type: "shop",
      username: profile.olx_username ?? profile.name,
    };

    const sent = await client.sendTextMessage({
      conversationId: conv.olx_conversation_id,
      receiverId: conv.buyer_id,
      content: text,
      sender,
    });

    const row = mapOlxMessageToRow(
      conv.profile_id,
      conv.id,
      conv.olx_conversation_id,
      conv.olx_listing_id,
      olxUserId,
      sent,
    );

    const { data: inserted, error } = await admin
      .from("messages")
      .upsert(row, { onConflict: "profile_id,olx_message_id" })
      .select("id, olx_message_id, body, type, status, direction, sent_at, data")
      .single();

    if (error || !inserted) {
      throw new Error(error?.message ?? "Upis poruke nije uspio.");
    }

    await admin
      .from("conversations")
      .update({
        last_message_at: inserted.sent_at ?? new Date().toISOString(),
        last_message_type: inserted.type,
        unread_count: 0,
        archived: false,
      })
      .eq("id", conversationId);

    revalidatePath("/poruke");
    revalidatePath(`/poruke/${conversationId}`);

    return inserted;
  } catch (err) {
    if (isAuthFailure(err)) {
      await handleOlxAuthFailure(admin, conv.profile_id, profile.name, err);
    }
    throw err;
  }
}

export async function sendImageMessageAction(
  conversationId: string,
  formData: FormData,
): Promise<SendMessageResult> {
  await requireUser();
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Odaberi sliku.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Slika je prevelika (max 5 MB).");
  }
  if (file.type && !ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Dozvoljeni formati: JPEG, PNG, WebP, GIF.");
  }

  const conv = await getConversationForAction(conversationId);
  if (!conv.buyer_id) {
    throw new Error("Konverzacija nema kupca (receiver_id).");
  }

  const admin = createAdminClient();
  const profile = await loadProfileForWorker(admin, conv.profile_id);

  try {
    const client = await createClientForProfileId(conv.profile_id);
    const olxUserId = await ensureOlxUserId(admin, profile, client);

    await sleep(SEND_THROTTLE_MS);

    const buffer = new Uint8Array(await file.arrayBuffer());
    const sent = await client.sendImageMessage({
      conversationId: conv.olx_conversation_id,
      receiverId: conv.buyer_id,
      image: buffer,
      filename: file.name || "image.jpg",
      contentType: file.type || "image/jpeg",
    });

    const row = mapOlxMessageToRow(
      conv.profile_id,
      conv.id,
      conv.olx_conversation_id,
      conv.olx_listing_id,
      olxUserId,
      sent,
    );

    const { data: inserted, error } = await admin
      .from("messages")
      .upsert(row, { onConflict: "profile_id,olx_message_id" })
      .select("id, olx_message_id, body, type, status, direction, sent_at, data")
      .single();

    if (error || !inserted) {
      throw new Error(error?.message ?? "Upis slike nije uspio.");
    }

    await admin
      .from("conversations")
      .update({
        last_message_at: inserted.sent_at ?? new Date().toISOString(),
        last_message_type: "image",
        unread_count: 0,
        archived: false,
      })
      .eq("id", conversationId);

    revalidatePath("/poruke");
    revalidatePath(`/poruke/${conversationId}`);

    return inserted;
  } catch (err) {
    if (isAuthFailure(err)) {
      await handleOlxAuthFailure(admin, conv.profile_id, profile.name, err);
    }
    throw err;
  }
}

export async function archiveConversationAction(
  conversationId: string,
  archived: boolean,
) {
  await requireUser();
  await getConversationForAction(conversationId);
  const admin = createAdminClient();
  const { error } = await admin
    .from("conversations")
    .update({ archived })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);
  revalidatePath("/poruke");
  revalidatePath(`/poruke/${conversationId}`);
}

export async function setSavedAction(
  conversationId: string,
  saved: boolean,
) {
  await requireUser();
  const conv = await getConversationForAction(conversationId);
  const admin = createAdminClient();

  if (saved) {
    try {
      const client = await createClientForProfileId(conv.profile_id);
      await client.saveConversation(conv.olx_conversation_id);
    } catch (err) {
      if (isAuthFailure(err)) {
        const profile = await loadProfileForWorker(admin, conv.profile_id);
        await handleOlxAuthFailure(admin, conv.profile_id, profile.name, err);
      }
      // Best-effort: still update local if OLX fails for non-auth reasons
      console.warn("OLX saveConversation:", err);
    }
  }
  // Unsave: OLX endpoint nije potvrđen — samo lokalno

  const { error } = await admin
    .from("conversations")
    .update({ saved })
    .eq("id", conversationId);
  if (error) throw new Error(error.message);

  revalidatePath("/poruke");
  revalidatePath(`/poruke/${conversationId}`);
}

export async function loadOlderMessagesAction(
  conversationId: string,
  page: number,
) {
  await requireUser();
  const conv = await getConversationForAction(conversationId);
  const admin = createAdminClient();

  await runSyncMessagesWorker(admin, {
    profileId: conv.profile_id,
    conversationIds: [conv.olx_conversation_id],
    onlyUnread: false,
    page: Math.max(1, page),
    maxPagesPerConversation: 1,
  });

  const supabase = await createClient();
  return fetchMessages(supabase, conversationId, { limit: 200 });
}
