"use client";

import { useRouter } from "next/navigation";

import {
  useOlxInboxPoll,
  useRealtimeConversations,
} from "@/components/messages/use-realtime-messages";

/** Realtime na DB + OLX sync (server→proxy) na focus / svakih 2 min. */
export function PorukePoll({
  profileId,
  conversationId = null,
}: {
  profileId: string | null;
  conversationId?: string | null;
}) {
  const router = useRouter();
  useRealtimeConversations(profileId, () => {
    router.refresh();
  });
  useOlxInboxPoll(profileId, conversationId);
  return null;
}
