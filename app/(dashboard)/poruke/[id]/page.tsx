import Link from "next/link";
import { notFound } from "next/navigation";

import { PorukePoll } from "@/components/messages/poruke-poll";
import { ThreadPanel } from "@/components/messages/thread-panel";
import {
  fetchConversationById,
  fetchMessages,
} from "@/lib/messages/queries";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PorukeThreadPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const conversation = await fetchConversationById(supabase, id);
  if (!conversation) notFound();

  const messages = await fetchMessages(supabase, conversation.id, {
    limit: 100,
  });

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-3xl flex-col">
      <PorukePoll
        profileId={conversation.profileId}
        conversationId={conversation.id}
      />
      <Link
        href="/poruke"
        className="mb-2 shrink-0 text-sm text-teal-600 hover:underline"
      >
        ← Svi razgovori
      </Link>
      <div className="min-h-0 flex-1">
        <ThreadPanel
          key={conversation.id}
          conversation={conversation}
          initialMessages={messages}
          backHref="/poruke"
        />
      </div>
    </div>
  );
}
