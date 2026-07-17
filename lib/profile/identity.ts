import { createHash } from "crypto";

/** Stabilan device_name za OLX login (po profilu). */
export function generateDeviceName(profileId: string, profileName: string): string {
  const slug = profileName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .slice(0, 20);
  const short = createHash("sha256")
    .update(profileId)
    .digest("hex")
    .slice(0, 8);
  return `olx_${slug}_${short}`;
}

/** Stabilan User-Agent po profilu (anti-detekcija). */
export function generateUserAgent(profileId: string): string {
  const hash = createHash("sha256").update(profileId).digest("hex");
  const minor = parseInt(hash.slice(0, 2), 16) % 40;
  const patch = parseInt(hash.slice(2, 4), 16) % 20;
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/12${minor}.0.${4000 + patch}.0 Safari/537.36`;
}

export function ensureProfileIdentity(
  profileId: string,
  profileName: string,
  deviceName: string | null,
  userAgent: string | null,
): { device_name: string; user_agent: string } {
  return {
    device_name: deviceName?.trim() || generateDeviceName(profileId, profileName),
    user_agent: userAgent?.trim() || generateUserAgent(profileId),
  };
}
