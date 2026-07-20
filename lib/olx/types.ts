export type OlxUser = {
  id: number;
  type: string;
  email: string;
  username: string;
  first_name?: string;
  last_name?: string;
  [key: string]: unknown;
};

/** Javni /users/:username odgovor (shop profil). */
export type OlxPublicUser = {
  id: number;
  type: string;
  username: string;
  avatar: string | null;
  shop?: {
    package?: string | null;
    business_name?: string | null;
    active?: boolean;
  } | null;
  [key: string]: unknown;
};

export type OlxLoginResponse = {
  token: string;
  user: OlxUser;
};

export type OlxCategory = {
  id: number;
  name: string;
  name_singular?: string;
  slug: string;
  parent_id: number | null;
  order?: number;
  top_category?: boolean;
  highlighted?: boolean;
  shipping_available?: boolean;
  sensitive_content?: boolean;
  show_price?: boolean;
  show_brand?: boolean;
  brand_required?: boolean;
  model_required?: boolean;
  has_models?: boolean;
  show_condition?: boolean;
  show_map?: boolean;
  listing_fee?: number;
  base_listing_price?: number;
  icon?: string;
};

export type OlxAttribute = {
  id: number;
  type: string;
  name: string;
  input_type: string;
  display_name: string;
  options: string[];
  rank: number;
  order: number;
  required: boolean;
  highlighted: boolean;
};

export type OlxBrand = {
  id: number;
  name: string;
  slug: string;
};

export type OlxModel = {
  id: number;
  name: string;
  slug: string;
};

export type OlxCategoryFindResult = {
  id: number;
  name: string;
  path: string;
};

export type OlxListingAttribute = {
  id: number;
  value: string;
};

export type CreateListingPayload = {
  title: string;
  category_id: number;
  description?: string;
  price: number;
  listing_type: "sell";
  state: "new" | "used";
  price_by_agreement: boolean;
  quantity: number;
  available: boolean;
  attributes?: OlxListingAttribute[];
};

export type UpdateListingPayload = {
  price?: number;
  title?: string;
  description?: string;
  available?: boolean;
};

export type OlxListingDetail = {
  id: number;
  title: string;
  price: number;
  status: string;
  [key: string]: unknown;
};

export type OlxListingCreated = {
  id: number;
  title: string;
  status?: string;
  [key: string]: unknown;
};

export type OlxListingImage = {
  id: number;
  name: string;
  main: boolean;
  order: number;
};

export type OlxUserListing = {
  id: number;
  title: string;
  category_id: number;
  price: number;
  status: string;
  state?: string;
  listing_type?: string;
  image_url?: string | null;
  refresh_available?: boolean;
  /** Unix timestamp (seconds) — listing date / last bump on OLX. */
  date?: number;
  [key: string]: unknown;
};

export type OlxRefreshLimits = {
  free_limit: number;
  free_count: number;
  paid_count: number;
  listing_count: number;
};

export type OlxConversationSender = {
  id: number;
  type?: string;
  username?: string;
  avatar?: string;
  avg_response_time?: number;
};

export type OlxConversationListing = {
  id: number;
  title?: string;
  price?: number;
  status?: string;
  refresh_available?: boolean;
  created_at?: number;
  category?: { id: number; name?: string; slug?: string };
};

export type OlxConversation = {
  id: number;
  seen?: boolean;
  sender?: OlxConversationSender;
  last_message?: { id?: number; type?: string; content?: string };
  listing?: OlxConversationListing | null;
  unread_messages?: number;
  created_at: number;
  updated_at: number;
};

export type OlxPaginatedMeta = {
  total: number;
  last_page: number;
  current_page: number;
  per_page: number;
};

export type OlxPaginatedResponse<T> = {
  data: T[];
  meta: OlxPaginatedMeta;
};

export type OlxListingLimits = {
  cars: { limit: number; unlimited: boolean; listings: number };
  "real-estate": { limit: number; unlimited: boolean; listings: number };
  other: { limit: number; unlimited: boolean; listings: number };
};
