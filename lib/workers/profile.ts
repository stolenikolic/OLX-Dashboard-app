import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureProfileIdentity } from "@/lib/profile/identity";
import { OlxClient, createLoggedInClient } from "@/lib/olx/client";
import { notifyAdmin } from "@/lib/notify/email";
import { maybeResumeProfile } from "@/lib/olx/suspension";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

const TOKEN_TTL_MS = 23 * 60 * 60 * 1000;

export type ProfileForWorker = {
  id: string;
  name: string;
  status: Database["public"]["Enums"]["profile_status"];
  auth_method: Database["public"]["Enums"]["olx_auth_method"];
  olx_username: string | null;
  olx_login_email: string | null;
  olx_password_enc: string | null;
  olx_client_id: string | null;
  olx_client_token_enc: string | null;
  olx_bearer_token: string | null;
  olx_token_expires_at: string | null;
  olx_user_id: number | null;
  device_name: string | null;
  user_agent: string | null;
  proxy_url: string | null;
  daily_post_limit: number;
  description_template: string | null;
  suspended_until: string | null;
};

const PROFILE_SELECT = `
  id,
  name,
  status,
  auth_method,
  olx_username,
  olx_login_email,
  olx_password_enc,
  olx_client_id,
  olx_client_token_enc,
  olx_bearer_token,
  olx_token_expires_at,
  olx_user_id,
  device_name,
  user_agent,
  proxy_url,
  daily_post_limit,
  description_template,
  suspended_until
`;

export async function loadProfileForWorker(
  admin: Admin,
  profileId: string,
): Promise<ProfileForWorker> {
  const { data, error } = await admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", profileId)
    .single();

  if (error || !data) {
    throw new Error(`Profil ${profileId} nije pronađen.`);
  }

  if (data.status === "paused") {
    throw new Error(`Profil "${data.name}" je pauziran.`);
  }

  if (data.status === "suspended") {
    const resumed = await maybeResumeProfile(admin, data);
    if (!resumed) {
      throw new Error(
        `Profil "${data.name}" je suspendovan do ${data.suspended_until ?? "nepoznato"}.`,
      );
    }
    data.status = "active";
    data.suspended_until = null;
  }

  if (data.status !== "active") {
    throw new Error(`Profil "${data.name}" nije aktivan (${data.status}).`);
  }

  return data;
}

async function persistProfileIdentity(
  admin: Admin,
  profile: ProfileForWorker,
  identity: { device_name: string; user_agent: string },
): Promise<void> {
  if (
    profile.device_name === identity.device_name &&
    profile.user_agent === identity.user_agent
  ) {
    return;
  }

  await admin
    .from("profiles")
    .update({
      device_name: identity.device_name,
      user_agent: identity.user_agent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  profile.device_name = identity.device_name;
  profile.user_agent = identity.user_agent;
}

async function saveTokenCache(
  admin: Admin,
  profileId: string,
  token: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await admin
    .from("profiles")
    .update({
      olx_bearer_token: token,
      olx_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);
}

export async function ensureOlxUserId(
  admin: Admin,
  profile: ProfileForWorker,
  client: OlxClient,
): Promise<number> {
  if (profile.olx_user_id != null && profile.olx_user_id > 0) {
    return profile.olx_user_id;
  }

  const me = await client.me();
  const olxUserId = me.id;
  await admin
    .from("profiles")
    .update({
      olx_user_id: olxUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  profile.olx_user_id = olxUserId;
  return olxUserId;
}

function buildClientConfig(
  profile: ProfileForWorker,
  identity: { device_name: string; user_agent: string },
  token?: string | null,
): ConstructorParameters<typeof OlxClient>[0] {
  return {
    token: token ?? undefined,
    clientId: profile.olx_client_id,
    clientToken: profile.olx_client_token_enc,
    deviceName: identity.device_name,
    userAgent: identity.user_agent,
    proxyUrl: profile.proxy_url,
  };
}

export async function createClientForProfile(
  admin: Admin,
  profile: ProfileForWorker,
): Promise<OlxClient> {
  const identity = ensureProfileIdentity(
    profile.id,
    profile.name,
    profile.device_name,
    profile.user_agent,
  );
  await persistProfileIdentity(admin, profile, identity);

  if (profile.auth_method === "client_token") {
    if (!profile.olx_client_id || !profile.olx_client_token_enc) {
      throw new Error(
        `Profil "${profile.name}" koristi client_token auth ali nema olx_client_id / olx_client_token_enc.`,
      );
    }
    return new OlxClient(buildClientConfig(profile, identity));
  }

  const username =
    profile.olx_login_email ?? profile.olx_username ?? process.env.OLX_USERNAME;
  const password =
    profile.olx_password_enc ?? process.env.OLX_PASSWORD;

  if (!username || !password) {
    throw new Error(
      `Profil "${profile.name}" nema OLX kredencijale (olx_login_email / olx_password_enc).`,
    );
  }

  const expiresAt = profile.olx_token_expires_at
    ? new Date(profile.olx_token_expires_at)
    : null;

  if (
    profile.olx_bearer_token &&
    expiresAt &&
    expiresAt.getTime() > Date.now() + 60_000
  ) {
    const cached = new OlxClient(
      buildClientConfig(profile, identity, profile.olx_bearer_token),
    );
    try {
      const me = await cached.me();
      if (profile.olx_user_id == null && me?.id) {
        await admin
          .from("profiles")
          .update({
            olx_user_id: me.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", profile.id);
        profile.olx_user_id = me.id;
      }
      return cached;
    } catch {
      console.warn(
        `Keširani token za "${profile.name}" nije validan — novi login.`,
      );
      await notifyAdmin({
        subject: `[OLX Dashboard] Token istekao: ${profile.name}`,
        body: `Keširani OLX token za profil "${profile.name}" nije validan. Izvršava se novi login.`,
      });
    }
  }

  const client = await createLoggedInClient(username, password, {
    deviceName: identity.device_name,
    userAgent: identity.user_agent,
    proxyUrl: profile.proxy_url,
  });

  const token = client.getToken();
  if (token) {
    await saveTokenCache(admin, profile.id, token);
  }

  // Keširaj shop user id nakon login-a (za direction out/in)
  if (profile.olx_user_id == null) {
    try {
      await ensureOlxUserId(admin, profile, client);
    } catch (err) {
      console.warn(
        `ensureOlxUserId za "${profile.name}" nije uspio:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return client;
}

export async function listActiveProfiles(admin: Admin): Promise<
  Array<{ id: string; name: string }>
> {
  const { data, error } = await admin
    .from("profiles")
    .select("id, name, status, suspended_until")
    .in("status", ["active", "suspended"])
    .order("name");

  if (error) {
    throw new Error(`Lista profila nije uspjela: ${error.message}`);
  }

  const profiles: Array<{ id: string; name: string }> = [];

  for (const row of data ?? []) {
    if (row.status === "active") {
      profiles.push({ id: row.id, name: row.name });
      continue;
    }

    const resumed = await maybeResumeProfile(admin, row);
    if (resumed) {
      profiles.push({ id: row.id, name: row.name });
    }
  }

  return profiles;
}

export async function clearProfileTokenCache(
  admin: Admin,
  profileId: string,
): Promise<void> {
  await admin
    .from("profiles")
    .update({
      olx_bearer_token: null,
      olx_token_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);
}
