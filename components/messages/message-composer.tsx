"use client";

import type { SendMessageResult } from "@/lib/messages/actions";

export function MessageComposer(props: {
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
  void props;
  return (
    <div className="border-t border-zinc-200 bg-white p-3">
      <p className="text-sm text-zinc-500">
        Slanje poruka sa dashboarda je onemogućeno.
      </p>
    </div>
  );
}
