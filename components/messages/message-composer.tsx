"use client";

import { useRef, useState, useTransition } from "react";

import {
  sendImageMessageAction,
  sendMessageAction,
  type SendMessageResult,
} from "@/lib/messages/actions";

export function MessageComposer({
  conversationId,
  onOptimistic,
  onSent,
  onFailed,
}: {
  conversationId: string;
  onOptimistic: (temp: {
    id: string;
    body: string;
    type: string;
    content?: File;
  }) => void;
  onSent: (tempId: string, result: SendMessageResult) => void;
  onFailed: (tempId: string, retry: () => void) => void;
}) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const lastFailedRef = useRef<{
    kind: "text" | "image";
    value: string | File;
  } | null>(null);

  function sendText(value: string) {
    const trimmed = value.trim();
    if (!trimmed || pending) return;
    const tempId = `temp-${Date.now()}`;
    onOptimistic({ id: tempId, body: trimmed, type: "text" });
    setText("");
    lastFailedRef.current = { kind: "text", value: trimmed };

    startTransition(async () => {
      try {
        const result = await sendMessageAction(conversationId, trimmed);
        onSent(tempId, result);
        lastFailedRef.current = null;
      } catch {
        onFailed(tempId, () => {
          if (lastFailedRef.current?.kind === "text") {
            sendText(String(lastFailedRef.current.value));
          }
        });
      }
    });
  }

  function sendImage(file: File) {
    if (pending) return;
    const tempId = `temp-img-${Date.now()}`;
    onOptimistic({ id: tempId, body: "", type: "image", content: file });
    lastFailedRef.current = { kind: "image", value: file };

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("image", file);
        const result = await sendImageMessageAction(conversationId, fd);
        onSent(tempId, result);
        lastFailedRef.current = null;
      } catch {
        onFailed(tempId, () => {
          if (
            lastFailedRef.current?.kind === "image" &&
            lastFailedRef.current.value instanceof File
          ) {
            sendImage(lastFailedRef.current.value);
          }
        });
      }
    });
  }

  return (
    <div className="border-t border-zinc-200 bg-white p-3">
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) sendImage(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-zinc-200 px-2.5 py-2 text-sm text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          title="Pošalji sliku"
        >
          📎
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendText(text);
            }
          }}
          rows={2}
          placeholder="Napiši poruku… (Enter = pošalji)"
          disabled={pending}
          className="min-h-[42px] flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={pending || !text.trim()}
          onClick={() => sendText(text)}
          className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          Pošalji
        </button>
      </div>
    </div>
  );
}
