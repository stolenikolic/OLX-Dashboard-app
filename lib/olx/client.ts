import type {
  CreateListingPayload,
  OlxAttribute,
  OlxBrand,
  OlxCategory,
  OlxCategoryFindResult,
  OlxConversation,
  OlxListingCreated,
  OlxListingDetail,
  OlxListingImage,
  OlxListingLimits,
  OlxLoginResponse,
  OlxModel,
  OlxPaginatedResponse,
  OlxPublicUser,
  OlxRefreshLimits,
  OlxUser,
  OlxUserListing,
  UpdateListingPayload,
} from "@/lib/olx/types";

const DEFAULT_BASE_URL = "https://api.olx.ba";
const DEFAULT_DEVICE_NAME = "api_integration";

export class OlxApiError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "OlxApiError";
    this.status = status;
    this.body = body;
  }
}

export type OlxClientConfig = {
  baseUrl?: string;
  /** Bearer token (preferred auth). */
  token?: string | null;
  /** Legacy auth via OLX-CLIENT-ID / OLX-CLIENT-TOKEN headers. */
  clientId?: string | null;
  clientToken?: string | null;
  /** Anti-detection: per-profile device name and User-Agent. */
  deviceName?: string;
  userAgent?: string | null;
  /** Optional per-profile proxy (e.g. http://user:pass@host:port). */
  proxyUrl?: string | null;
};

type RequestInitWithDispatcher = RequestInit & { dispatcher?: unknown };

export class OlxClient {
  private baseUrl: string;
  private token: string | null;
  private clientId: string | null;
  private clientToken: string | null;
  private deviceName: string;
  private userAgent: string | null;
  private proxyUrl: string | null;
  private dispatcher: unknown;

  constructor(config: OlxClientConfig = {}) {
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.token = config.token ?? null;
    this.clientId = config.clientId ?? null;
    this.clientToken = config.clientToken ?? null;
    this.deviceName = config.deviceName ?? DEFAULT_DEVICE_NAME;
    this.userAgent = config.userAgent ?? null;
    this.proxyUrl = config.proxyUrl ?? null;
  }

  getToken(): string | null {
    return this.token;
  }

  private baseHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    } else if (this.clientId && this.clientToken) {
      headers["OLX-CLIENT-ID"] = this.clientId;
      headers["OLX-CLIENT-TOKEN"] = this.clientToken;
    }
    if (this.userAgent) {
      headers["User-Agent"] = this.userAgent;
    }
    return headers;
  }

  private async getDispatcher(): Promise<unknown> {
    if (!this.proxyUrl) return undefined;
    if (this.dispatcher) return this.dispatcher;
    // undici ships with Node; import dynamically to avoid bundling/types coupling.
    const undici = (await import("undici")) as {
      ProxyAgent: new (url: string) => unknown;
    };
    this.dispatcher = new undici.ProxyAgent(this.proxyUrl);
    return this.dispatcher;
  }

  private shouldRetryStatus(status: number): boolean {
    return status === 429 || (status >= 500 && status <= 599);
  }

  private async requestWithRetry(
    url: string,
    init: RequestInitWithDispatcher,
    maxAttempts = 5,
  ): Promise<Response> {
    let lastResponse: Response | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      lastResponse = await fetch(url, init);
      if (!this.shouldRetryStatus(lastResponse.status)) return lastResponse;
      const waitMs = Math.min(60_000, 2000 * 2 ** (attempt - 1));
      await new Promise((r) => setTimeout(r, waitMs));
    }
    return lastResponse!;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`;
    const dispatcher = await this.getDispatcher();

    const requestInit: RequestInitWithDispatcher = {
      ...init,
      headers: { ...this.baseHeaders(), ...(init.headers ?? {}) },
    };
    if (dispatcher) {
      requestInit.dispatcher = dispatcher;
    }

    const response = await this.requestWithRetry(url, requestInit);
    const text = await response.text();

    if (!response.ok) {
      throw new OlxApiError(
        `OLX API ${response.status} ${response.statusText} za ${path}`,
        response.status,
        text.slice(0, 500),
      );
    }

    return (text ? JSON.parse(text) : null) as T;
  }

  /** Authenticates with username/password and stores the resulting bearer token. */
  async login(
    username: string,
    password: string,
    deviceName?: string,
  ): Promise<OlxLoginResponse> {
    const body = new URLSearchParams({
      username,
      password,
      device_name: deviceName ?? this.deviceName,
    });

    const data = await this.request<OlxLoginResponse>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    this.token = data.token;
    return data;
  }

  async me(): Promise<OlxUser> {
    return this.request<OlxUser>("/me");
  }

  /** Top-level categories. */
  async getCategories(): Promise<OlxCategory[]> {
    const res = await this.request<{ data: OlxCategory[] }>("/categories");
    return res.data;
  }

  /** Direct children of a category. */
  async getChildren(categoryId: number): Promise<OlxCategory[]> {
    const res = await this.request<{ data: OlxCategory[] }>(
      `/categories/${categoryId}`,
    );
    return res.data;
  }

  /** A single category by id. */
  async getCategory(categoryId: number): Promise<OlxCategory> {
    const res = await this.request<{ data: OlxCategory }>(
      `/category/${categoryId}`,
    );
    return res.data;
  }

  async getCategoryAttributes(categoryId: number): Promise<OlxAttribute[]> {
    const res = await this.request<{ data: OlxAttribute[] }>(
      `/categories/${categoryId}/attributes`,
    );
    return res.data;
  }

  async getCategoryBrands(categoryId: number): Promise<OlxBrand[]> {
    const res = await this.request<{ data: OlxBrand[] }>(
      `/categories/${categoryId}/brands`,
    );
    return res.data;
  }

  async getModels(categoryId: number, brandId: number): Promise<OlxModel[]> {
    const res = await this.request<{ data: OlxModel[] }>(
      `/categories/${categoryId}/brands/${brandId}/models`,
    );
    return res.data;
  }

  async findCategory(name: string): Promise<OlxCategoryFindResult[]> {
    return this.request<OlxCategoryFindResult[]>(
      `/categories/find?name=${encodeURIComponent(name)}`,
    );
  }

  async suggestCategory(keyword: string): Promise<unknown> {
    return this.request<unknown>(
      `/categories/suggest?keyword=${encodeURIComponent(keyword)}`,
    );
  }

  async createListing(payload: CreateListingPayload): Promise<OlxListingCreated> {
    return this.request<OlxListingCreated>("/listings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async getListing(listingId: number): Promise<OlxListingDetail> {
    return this.request<OlxListingDetail>(`/listings/${listingId}`);
  }

  async updateListing(
    listingId: number,
    payload: UpdateListingPayload,
  ): Promise<OlxListingDetail> {
    return this.request<OlxListingDetail>(`/listings/${listingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async uploadListingImage(
    listingId: number,
    imageUrl: string,
  ): Promise<OlxListingImage[]> {
    return this.request<OlxListingImage[]>(`/listings/${listingId}/image-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl }),
    });
  }

  async setMainImage(
    listingId: number,
    imageId: number,
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(
      `/listings/${listingId}/image-main`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: String(imageId) }),
      },
    );
  }

  async publishListing(
    listingId: number,
  ): Promise<{ message: string; status: string }> {
    return this.request<{ message: string; status: string }>(
      `/listings/${listingId}/publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  async hideListing(listingId: number): Promise<{ message?: string }> {
    return this.request<{ message?: string }>(`/listings/${listingId}/hide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  }

  async unhideListing(listingId: number): Promise<{ message?: string }> {
    return this.request<{ message?: string }>(`/listings/${listingId}/unhide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  }

  async finishListing(listingId: number): Promise<{ message?: string }> {
    return this.request<{ message?: string }>(`/listings/${listingId}/finish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  }

  async deleteListing(listingId: number): Promise<{ message?: string }> {
    return this.request<{ message?: string }>(`/listings/${listingId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
  }

  async getUser(username: string): Promise<OlxPublicUser> {
    const res = await this.request<{ data: OlxPublicUser }>(
      `/users/${encodeURIComponent(username)}`,
    );
    return res.data;
  }

  async getUserListings(
    username: string,
    page = 1,
    selectedCategoryId?: number,
    perPage = 1000,
    sortOrder: "asc" | "desc" = "desc",
  ): Promise<OlxPaginatedResponse<OlxUserListing>> {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      sort_order: sortOrder,
    });
    if (selectedCategoryId != null) {
      params.set("selected_category", String(selectedCategoryId));
    }
    return this.request<OlxPaginatedResponse<OlxUserListing>>(
      `/users/${encodeURIComponent(username)}/listings?${params}`,
    );
  }

  async getListingLimits(): Promise<OlxListingLimits> {
    const res = await this.request<{ data: OlxListingLimits }>(
      "/listing-limits",
    );
    return res.data;
  }

  async getRefreshLimits(): Promise<OlxRefreshLimits> {
    return this.request<OlxRefreshLimits>("/listing/refresh/limits");
  }

  async refreshListing(
    listingId: number,
  ): Promise<{ message?: string }> {
    return this.request<{ message?: string }>(
      `/listings/${listingId}/refresh`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  /**
   * Authenticated user listings — includes `refresh_available`
   * (unlike the public search API).
   */
  async getUserListingsAuthed(
    username: string,
    page = 1,
    perPage = 1000,
    sortOrder: "asc" | "desc" = "desc",
  ): Promise<OlxPaginatedResponse<OlxUserListing>> {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      sort_order: sortOrder,
    });
    return this.request<OlxPaginatedResponse<OlxUserListing>>(
      `/users/${encodeURIComponent(username)}/listings?${params}`,
    );
  }

  /** Web API conversations inbox (same Bearer token as api.olx.ba). */
  async getConversations(
    page = 1,
  ): Promise<{ data: OlxConversation[] }> {
    return this.request<{ data: OlxConversation[] }>(
      `https://olx.ba/api/conversations?page=${page}`,
    );
  }
}

/** Convenience: logs in and returns a ready client. */
export async function createLoggedInClient(
  username: string,
  password: string,
  config: OlxClientConfig = {},
): Promise<OlxClient> {
  const client = new OlxClient(config);
  await client.login(username, password);
  return client;
}
