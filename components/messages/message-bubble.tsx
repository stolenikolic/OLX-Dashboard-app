"use client";

import { useState } from "react";

import {
  formatExactTime,
  formatRelativeTime,
} from "@/lib/format/time";
import type { MessageRow } from "@/lib/messages/queries";
import type { Json } from "@/types/database";

function asRecord(data: Json | null): Record<string, unknown> | null {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return null;
}

function imageUrl(data: Json | null): string | null {
  const rec = asRecord(data);
  const nested = rec?.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const url = (nested as { url?: string }).url;
    if (typeof url === "string") return url;
  }
  if (typeof rec?.url === "string") return rec.url;
  return null;
}

export function MessageBubble({
  message,
  failed,
  onRetry,
}: {
  message: MessageRow & { clientStatus?: "sending" | "failed" };
  failed?: boolean;
  onRetry?: () => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const isOut = message.direction === "out";
  const isSystem =
    message.type === "system" ||
    (asRecord(message.data)?.sender as { type?: string } | undefined)?.type ===
      "system";
  const url = imageUrl(message.data);
  const sending = message.clientStatus === "sending";
  const isFailed = failed || message.clientStatus === "failed";

  if (isSystem) {
    return (
      <div className="flex justify-center px-4 py-1">
        <p className="max-w-[80%] rounded-full bg-zinc-100 px-3 py-1 text-center text-xs text-zinc-500">
          {message.body || "Sistemska poruka"}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={`flex px-3 ${isOut ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
            isOut
              ? "rounded-br-md bg-teal-600 text-white"
              : "rounded-bl-md bg-white text-zinc-900 ring-1 ring-zinc-200"
          } ${sending ? "opacity-70" : ""} ${isFailed ? "ring-2 ring-red-400" : ""}`}
          title={formatExactTime(message.sentAt)}
        >
          {message.type === "image" && url ? (
            <button
              type="button"
              onClick={() => setLightbox(url)}
              className="block overflow-hidden rounded-lg"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="Prilog"
                className="max-h-56 max-w-full object-cover"
              />
            </button>
          ) : null}

          {/* type=listing: samo tekst — listing je već u thread headeru */}
          {message.body ? (
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          ) : message.type === "listing" ? (
            <p className="italic opacity-80">Upit za oglas</p>
          ) : null}

          <div
            className={`mt-1 flex items-center gap-1 text-[10px] ${
              isOut ? "justify-end text-teal-100" : "text-zinc-400"
            }`}
          >
            <span>{formatRelativeTime(message.sentAt)}</span>
            {isOut && message.status ? (
              <span aria-label={message.status}>
                {message.status === "seen" ? "✓✓" : "✓"}
              </span>
            ) : null}
            {sending ? <span>…</span> : null}
          </div>

          {isFailed && onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1 text-xs underline"
            >
              Nije poslano — pokušaj ponovo
            </button>
          ) : null}
        </div>
      </div>

      {lightbox ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
        >
          <div
            className="relative max-h-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox}
              alt="Pregled"
              className="max-h-[85vh] max-w-full rounded-lg object-contain"
            />
            <div className="mt-2 flex justify-end gap-2">
              <a
                href={lightbox}
                download
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-zinc-800"
              >
                Preuzmi
              </a>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-white"
              >
                Zatvori
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
