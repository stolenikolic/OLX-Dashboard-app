"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import { MessageBubble } from "@/components/messages/message-bubble";
import { MessageComposer } from "@/components/messages/message-composer";
import {
  DateSeparator,
  MessageSkeleton,
} from "@/components/messages/message-skeleton";
import { ThreadHeader } from "@/components/messages/thread-header";
import {
  useRealtimeMessages,
} from "@/components/messages/use-realtime-messages";
import {
  loadOlderMessagesAction,
  openConversationAction,
  type SendMessageResult,
} from "@/lib/messages/actions";
import type {
  ConversationListItem,
  MessageRow,
} from "@/lib/messages/queries";
import { dayKey, formatDateSeparator } from "@/lib/format/time";

type UiMessage = MessageRow & {
  clientStatus?: "sending" | "failed";
  localPreviewUrl?: string;
};

export function ThreadPanel({
  conversation,
  initialMessages,
  backHref,
}: {
  conversation: ConversationListItem;
  initialMessages: MessageRow[];
  backHref?: string;
}) {
  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [syncing, setSyncing] = useState(false);
  const [olderPage, setOlderPage] = useState(2);
  const [hasOlder, setHasOlder] = useState(true);
  const [retryMap, setRetryMap] = useState<Record<string, () => void>>({});
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const openedRef = useRef(false);

  // Fire-and-forget open: UI odmah pokazuje DB poruke
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    setSyncing(initialMessages.length === 0);
    startTransition(async () => {
      try {
        await openConversationAction(conversation.id);
      } finally {
        setSyncing(false);
      }
    });
  }, [conversation.id, initialMessages.length, startTransition]);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  useEffect(() => {
    scrollToBottom(messages.length > 5);
  }, [messages.length, scrollToBottom]);

  const appendMessage = useCallback((msg: MessageRow) => {
    setMessages((prev) => {
      if (
        prev.some(
          (m) =>
            m.id === msg.id ||
            (msg.olxMessageId && m.olxMessageId === msg.olxMessageId),
        )
      ) {
        return prev;
      }
      return [...prev, msg];
    });
  }, []);

  useRealtimeMessages(conversation.id, appendMessage);

  const grouped = useMemo(() => {
    const items: Array<
      { type: "sep"; label: string } | { type: "msg"; message: UiMessage }
    > = [];
    let lastDay = "";
    for (const m of messages) {
      const key = dayKey(m.sentAt);
      if (key && key !== lastDay) {
        items.push({
          type: "sep",
          label: formatDateSeparator(m.sentAt ?? new Date().toISOString()),
        });
        lastDay = key;
      }
      items.push({ type: "msg", message: m });
    }
    return items;
  }, [messages]);

  function handleOptimistic(temp: {
    id: string;
    body: string;
    type: string;
    content?: File;
  }) {
    const preview =
      temp.type === "image" && temp.content
        ? URL.createObjectURL(temp.content)
        : undefined;
    setMessages((prev) => [
      ...prev,
      {
        id: temp.id,
        conversationRef: conversation.id,
        olxMessageId: null,
        type: temp.type,
        status: "sending",
        direction: "out",
        senderId: null,
        body: temp.body,
        data: preview
          ? ({ data: { url: preview } } as MessageRow["data"])
          : null,
        sentAt: new Date().toISOString(),
        isRead: true,
        clientStatus: "sending",
        localPreviewUrl: preview,
      },
    ]);
  }

  function handleSent(tempId: string, result: SendMessageResult) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === tempId
          ? {
              ...m,
              id: result.id,
              olxMessageId: result.olx_message_id,
              body: result.body,
              type: result.type,
              status: result.status,
              direction: result.direction,
              sentAt: result.sent_at,
              data: result.data,
              clientStatus: undefined,
            }
          : m,
      ),
    );
    setRetryMap((prev) => {
      const next = { ...prev };
      delete next[tempId];
      return next;
    });
  }

  function handleFailed(tempId: string, retry: () => void) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === tempId
          ? { ...m, clientStatus: "failed", status: "failed" }
          : m,
      ),
    );
    setRetryMap((prev) => ({ ...prev, [tempId]: retry }));
  }

  function loadOlder() {
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    startTransition(async () => {
      const all = await loadOlderMessagesAction(conversation.id, olderPage);
      setMessages(all);
      setOlderPage((p) => p + 1);
      if (all.length === 0 || all.length < olderPage * 15) {
        setHasOlder(false);
      }
      // Zadrži scroll poziciju nakon učitavanja starijih
      requestAnimationFrame(() => {
        if (el) {
          el.scrollTop = el.scrollHeight - prevHeight;
        }
      });
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 shadow-sm">
      <div className="shrink-0">
        <ThreadHeader conversation={conversation} backHref={backHref} />
        {syncing ? (
          <p className="border-b border-zinc-100 bg-teal-50/60 px-3 py-1 text-center text-[11px] text-teal-700">
            Osvježavam poruke…
          </p>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain py-3"
      >
        {messages.length === 0 && syncing ? <MessageSkeleton /> : null}

        {hasOlder && messages.length > 0 ? (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              onClick={loadOlder}
              className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
            >
              Učitaj starije
            </button>
          </div>
        ) : null}

        {grouped.map((item, idx) =>
          item.type === "sep" ? (
            <DateSeparator key={`sep-${idx}`} label={item.label} />
          ) : (
            <MessageBubble
              key={item.message.id}
              message={item.message}
              failed={item.message.clientStatus === "failed"}
              onRetry={retryMap[item.message.id]}
            />
          ),
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0">
        {!conversation.isSystem ? (
          <MessageComposer
            conversationId={conversation.id}
            onOptimistic={handleOptimistic}
            onSent={handleSent}
            onFailed={handleFailed}
          />
        ) : (
          <p className="border-t border-zinc-200 bg-white p-3 text-center text-xs text-zinc-400">
            Sistemska konverzacija — odgovor nije moguć.
          </p>
        )}
      </div>
    </div>
  );
}
