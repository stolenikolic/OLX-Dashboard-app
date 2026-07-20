"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import type { MessageRow } from "@/lib/messages/queries";
import type { Json } from "@/types/database";

function mapPayloadToMessage(row: Record<string, unknown>): MessageRow {
  return {
    id: String(row.id),
    conversationRef: (row.conversation_ref as string) ?? null,
    olxMessageId: (row.olx_message_id as number) ?? null,
    type: String(row.type ?? "text"),
    status: (row.status as string) ?? null,
    direction: String(row.direction ?? "in"),
    senderId: (row.sender_id as number) ?? null,
    body: (row.body as string) ?? null,
    data: (row.data as Json) ?? null,
    sentAt: (row.sent_at as string) ?? null,
    isRead: Boolean(row.is_read),
  };
}

export function useRealtimeMessages(
  conversationRef: string | null,
  onInsert: (msg: MessageRow) => void,
) {
  const onInsertRef = useRef(onInsert);

  useEffect(() => {
    onInsertRef.current = onInsert;
  }, [onInsert]);

  useEffect(() => {
    if (!conversationRef) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationRef}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_ref=eq.${conversationRef}`,
        },
        (payload) => {
          onInsertRef.current(mapPayloadToMessage(payload.new as Record<string, unknown>));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationRef]);
}

export function useRealtimeConversations(
  profileId: string | null,
  onChange: () => void,
) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!profileId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`conversations:${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `profile_id=eq.${profileId}`,
        },
        () => {
          onChangeRef.current();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profileId]);
}

/** Poll fallback: na focus + svakih 2 min dok je tab aktivan. */
export function usePollRefresh(enabled: boolean, intervalMs = 120_000) {
  const router = useRouter();
  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (timer) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") refresh();
      }, intervalMs);
    }

    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        refresh();
        start();
      } else {
        stop();
      }
    }

    function onFocus() {
      refresh();
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, intervalMs, refresh]);
}
