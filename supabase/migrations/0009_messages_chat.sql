-- =============================================================================
-- Faza 2: messages chat reshape + conversations chat fields + sync_messages
-- =============================================================================

alter type job_type add value if not exists 'sync_messages';

-- conversations: chat-specifična polja
alter table conversations
  add column if not exists buyer_avatar text,
  add column if not exists saved boolean not null default false,
  add column if not exists archived boolean not null default false,
  add column if not exists messages_synced_at timestamptz;

-- profiles: keširani OLX shop user id (za smjer poruke i sender objekt)
alter table profiles
  add column if not exists olx_user_id bigint;

-- messages: preoblikovanje za OLX chat model (tabela prazna)
alter table messages
  add column if not exists conversation_ref uuid references conversations(id) on delete cascade,
  add column if not exists olx_conversation_id bigint,
  add column if not exists olx_message_id bigint,
  add column if not exists type text not null default 'text',
  add column if not exists status text,
  add column if not exists sender_id bigint,
  add column if not exists data jsonb,
  add column if not exists sent_at timestamptz;

-- ukloni neiskorištene MVP kolone (tabela prazna)
alter table messages
  drop column if exists sender_email,
  drop column if exists sender_phone,
  drop column if exists sender_name,
  drop column if exists conversation_id;

-- dedupe: jedna OLX poruka po profilu (NULL olx_message_id dozvoljen više puta u PG)
create unique index if not exists uq_messages_profile_olx_msg
  on messages(profile_id, olx_message_id)
  where olx_message_id is not null;

do $$
begin
  alter table messages
    add constraint messages_profile_olx_message_unique
    unique (profile_id, olx_message_id);
exception
  when duplicate_object then null;
end $$;

create index if not exists idx_messages_conv_ref
  on messages(conversation_ref, sent_at);

-- Realtime publikacija (browser subscribe uz RLS)
do $$
begin
  alter publication supabase_realtime add table messages;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table conversations;
exception
  when duplicate_object then null;
end $$;

-- RLS insert/all za messages (service role svakako zaobilazi; ovo za admin UI)
drop policy if exists messages_admin on messages;
create policy messages_admin on messages
  for all using ( is_admin() ) with check ( is_admin() );
