"use client";

import { useRouter } from "next/navigation";

import {
  usePollRefresh,
  useRealtimeConversations,
} from "@/components/messages/use-realtime-messages";

/** Client wrapper: Realtime na conversations + poll fallback. */
export function PorukePoll({ profileId }: { profileId: string | null }) {
  const router = useRouter();
  useRealtimeConversations(profileId, () => {
    router.refresh();
  });
  usePollRefresh(true);
  return null;
}
