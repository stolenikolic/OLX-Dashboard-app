import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/types/database";

type Client = SupabaseClient<Database>;

export type ConversationFilter =
  | "all"
  | "unread"
  | "archived"
  | "saved"
  | "system";

export type ConversationListItem = {
  id: string;
  profileId: string;
  olxConversationId: number;
  buyerId: number | null;
  buyerUsername: string | null;
  buyerAvatar: string | null;
  olxListingId: number | null;
  listingTitle: string | null;
  lastMessageType: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  saved: boolean;
  archived: boolean;
  isSystem: boolean;
  thumbnail: string | null;
  listingPrice: number | null;
};

export type MessageRow = {
  id: string;
  conversationRef: string | null;
  olxMessageId: number | null;
  type: string;
  status: string | null;
  direction: string;
  senderId: number | null;
  body: string | null;
  data: Json | null;
  sentAt: string | null;
  isRead: boolean;
};

export type PaginatedConversations = {
  items: ConversationListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const DEFAULT_PAGE_SIZE = 40;

function emptyPage(page: number, pageSize: number): PaginatedConversations {
  return { items: [], total: 0, page, pageSize, totalPages: 0 };
}

export async function fetchConversations(
  supabase: Client,
  options?: {
    profileId?: string | null;
    filter?: ConversationFilter;
    search?: string;
    page?: number;
    pageSize?: number;
  },
): Promise<PaginatedConversations> {
  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const page = Math.max(1, options?.page ?? 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const filter = options?.filter ?? "all";
  const search = options?.search?.trim() || "";

  let query = supabase
    .from("conversations")
    .select(
      `
      id,
      profile_id,
      olx_conversation_id,
      buyer_id,
      buyer_username,
      buyer_avatar,
      olx_listing_id,
      listing_title,
      last_message_type,
      last_message_at,
      unread_count,
      saved,
      archived,
      is_system
    `,
      { count: "exact" },
    )
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (options?.profileId) {
    query = query.eq("profile_id", options.profileId);
  }

  if (filter === "unread") {
    query = query
      .eq("is_system", false)
      .gt("unread_count", 0)
      .eq("archived", false);
  } else if (filter === "archived") {
    query = query.eq("archived", true);
  } else if (filter === "saved") {
    query = query
      .eq("is_system", false)
      .eq("saved", true)
      .eq("archived", false);
  } else if (filter === "system") {
    query = query.eq("is_system", true).eq("archived", false);
  } else {
    // "all" — miješaj sistemske i obične
    query = query.eq("archived", false);
  }

  if (search) {
    query = query.or(
      `buyer_username.ilike.%${search}%,listing_title.ilike.%${search}%`,
    );
  }

  const { data, error, count } = await query;
  if (error || !data) {
    console.error("fetchConversations:", error?.message ?? "nema podataka");
    return emptyPage(page, pageSize);
  }

  // Thumbnail via listings → products for this page
  const listingIds = [
    ...new Set(
      data
        .map((c) => c.olx_listing_id)
        .filter((id): id is number => id != null),
    ),
  ];
  const profileIds = [...new Set(data.map((c) => c.profile_id))];

  const thumbByKey = new Map<string, { url: string | null; price: number | null }>();

  if (listingIds.length > 0 && profileIds.length > 0) {
    const { data: listings } = await supabase
      .from("listings")
      .select(
        `
        profile_id,
        olx_listing_id,
        posted_price,
        products ( main_image_url )
      `,
      )
      .in("profile_id", profileIds)
      .in("olx_listing_id", listingIds);

    for (const row of listings ?? []) {
      if (row.olx_listing_id == null) continue;
      const products = row.products as
        | { main_image_url: string | null }
        | { main_image_url: string | null }[]
        | null;
      const product = Array.isArray(products) ? products[0] : products;
      thumbByKey.set(`${row.profile_id}:${row.olx_listing_id}`, {
        url: product?.main_image_url ?? null,
        price: row.posted_price != null ? Number(row.posted_price) : null,
      });
    }
  }

  const total = count ?? 0;
  return {
    items: data.map((c) => {
      const thumb =
        c.olx_listing_id != null
          ? thumbByKey.get(`${c.profile_id}:${c.olx_listing_id}`)
          : undefined;
      return {
        id: c.id,
        profileId: c.profile_id,
        olxConversationId: c.olx_conversation_id,
        buyerId: c.buyer_id,
        buyerUsername: c.buyer_username,
        buyerAvatar: c.buyer_avatar,
        olxListingId: c.olx_listing_id,
        listingTitle: c.listing_title,
        lastMessageType: c.last_message_type,
        lastMessageAt: c.last_message_at,
        unreadCount: c.unread_count,
        saved: c.saved,
        archived: c.archived,
        isSystem: c.is_system,
        thumbnail: thumb?.url ?? null,
        listingPrice: thumb?.price ?? null,
      };
    }),
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

export async function fetchSystemConversations(
  supabase: Client,
  options?: { profileId?: string | null; limit?: number },
): Promise<ConversationListItem[]> {
  let query = supabase
    .from("conversations")
    .select(
      `
      id,
      profile_id,
      olx_conversation_id,
      buyer_id,
      buyer_username,
      buyer_avatar,
      olx_listing_id,
      listing_title,
      last_message_type,
      last_message_at,
      unread_count,
      saved,
      archived,
      is_system
    `,
    )
    .eq("is_system", true)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(options?.limit ?? 10);

  if (options?.profileId) {
    query = query.eq("profile_id", options.profileId);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((c) => ({
    id: c.id,
    profileId: c.profile_id,
    olxConversationId: c.olx_conversation_id,
    buyerId: c.buyer_id,
    buyerUsername: c.buyer_username,
    buyerAvatar: c.buyer_avatar,
    olxListingId: c.olx_listing_id,
    listingTitle: c.listing_title,
    lastMessageType: c.last_message_type,
    lastMessageAt: c.last_message_at,
    unreadCount: c.unread_count,
    saved: c.saved,
    archived: c.archived,
    isSystem: c.is_system,
    thumbnail: null,
    listingPrice: null,
  }));
}

export async function fetchConversationById(
  supabase: Client,
  conversationId: string,
): Promise<ConversationListItem | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      `
      id,
      profile_id,
      olx_conversation_id,
      buyer_id,
      buyer_username,
      buyer_avatar,
      olx_listing_id,
      listing_title,
      last_message_type,
      last_message_at,
      unread_count,
      saved,
      archived,
      is_system
    `,
    )
    .eq("id", conversationId)
    .maybeSingle();

  if (error || !data) return null;

  let thumbnail: string | null = null;
  let listingPrice: number | null = null;

  if (data.olx_listing_id != null) {
    const { data: listing } = await supabase
      .from("listings")
      .select("posted_price, products ( main_image_url )")
      .eq("profile_id", data.profile_id)
      .eq("olx_listing_id", data.olx_listing_id)
      .maybeSingle();

    if (listing) {
      listingPrice =
        listing.posted_price != null ? Number(listing.posted_price) : null;
      const products = listing.products as
        | { main_image_url: string | null }
        | { main_image_url: string | null }[]
        | null;
      const product = Array.isArray(products) ? products[0] : products;
      thumbnail = product?.main_image_url ?? null;
    }
  }

  return {
    id: data.id,
    profileId: data.profile_id,
    olxConversationId: data.olx_conversation_id,
    buyerId: data.buyer_id,
    buyerUsername: data.buyer_username,
    buyerAvatar: data.buyer_avatar,
    olxListingId: data.olx_listing_id,
    listingTitle: data.listing_title,
    lastMessageType: data.last_message_type,
    lastMessageAt: data.last_message_at,
    unreadCount: data.unread_count,
    saved: data.saved,
    archived: data.archived,
    isSystem: data.is_system,
    thumbnail,
    listingPrice,
  };
}

export async function fetchMessages(
  supabase: Client,
  conversationRef: string,
  options?: { limit?: number },
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, conversation_ref, olx_message_id, type, status, direction, sender_id, body, data, sent_at, is_read",
    )
    .eq("conversation_ref", conversationRef)
    .order("sent_at", { ascending: true })
    .limit(options?.limit ?? 200);

  if (error || !data) return [];

  return data.map((m) => ({
    id: m.id,
    conversationRef: m.conversation_ref,
    olxMessageId: m.olx_message_id,
    type: m.type,
    status: m.status,
    direction: m.direction,
    senderId: m.sender_id,
    body: m.body,
    data: m.data,
    sentAt: m.sent_at,
    isRead: m.is_read,
  }));
}

export async function fetchUnreadTotal(
  supabase: Client,
  profileId?: string | null,
): Promise<number> {
  let query = supabase
    .from("conversations")
    .select("unread_count")
    .eq("is_system", false)
    .eq("archived", false)
    .gt("unread_count", 0);

  if (profileId) {
    query = query.eq("profile_id", profileId);
  }

  const { data, error } = await query;
  if (error || !data) return 0;
  return data.reduce((sum, row) => sum + (row.unread_count ?? 0), 0);
}
