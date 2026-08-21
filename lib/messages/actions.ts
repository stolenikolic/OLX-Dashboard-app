"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/dal";
import { fetchMessages } from "@/lib/messages/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const CHAT_DISABLED = "Slanje poruka sa dashboarda je onemogućeno.";

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

export async function pollInboxFromOlxAction(
  profileId: string,
  options?: { conversationId?: string | null },
): Promise<{
  conversationsUpserted: number;
  messagesUpserted: number;
}> {
  void profileId;
  void options;
  throw new Error(CHAT_DISABLED);
}

export async function openConversationAction(conversationId: string) {
  await requireUser();
  const conv = await getConversationForAction(conversationId);
  const admin = createAdminClient();

  if (conv.unread_count > 0) {
    await admin
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conversationId);
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
  void conversationId;
  void content;
  throw new Error(CHAT_DISABLED);
}

export async function sendImageMessageAction(
  conversationId: string,
  formData: FormData,
): Promise<SendMessageResult> {
  void conversationId;
  void formData;
  throw new Error(CHAT_DISABLED);
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
  await getConversationForAction(conversationId);
  const admin = createAdminClient();

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
  void page;
  await requireUser();
  const supabase = await createClient();
  return fetchMessages(supabase, conversationId, { limit: 200 });
}
