import { createHash } from "crypto";

import { generateBrowserIdentity, isLegacyUserAgent } from "@/lib/profile/browser-identity";
import { fnv1a } from "@/lib/workers/profile-shuffle";

/**
 * Stabilan device_name za OLX login (po profilu).
 * Stil (separator/capitalizacija) varira po profilu da se ni format
 * device_name-a ne ponavlja identično između naloga.
 */
export function generateDeviceName(profileId: string, profileName: string): string {
  const slug = profileName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20);
  const short = createHash("sha256").update(profileId).digest("hex").slice(0, 8);
  const style = fnv1a(`device-style:${profileId}`) % 3;

  if (style === 0) return `olx_${slug}_${short}`;
  if (style === 1) return `${slug.replace(/_/g, "-")}-${short}`;
  const capitalized = slug.replace(/(^|_)([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
  return `${capitalized}_${short}`;
}

/**
 * Prepoznaje generički/legacy device_name ("api_integration" default iz
 * OlxClient-a) da bi se forsirala jednokratna regeneracija.
 */
export function isLegacyDeviceName(deviceName: string | null | undefined): boolean {
  if (!deviceName?.trim()) return true;
  return deviceName === "api_integration";
}

/**
 * Osigurava validan, per-profil device_name i user_agent.
 * Postojeće validne vrijednosti se ne diraju (idempotentno); legacy/prazne
 * vrijednosti se regenerišu JEDNOM i onda ostaju stabilne.
 */
export function ensureProfileIdentity(
  profileId: string,
  profileName: string,
  deviceName: string | null,
  userAgent: string | null,
): { device_name: string; user_agent: string } {
  const needsDeviceName = isLegacyDeviceName(deviceName);
  const needsUserAgent = isLegacyUserAgent(userAgent);

  return {
    device_name: needsDeviceName
      ? generateDeviceName(profileId, profileName)
      : deviceName!.trim(),
    user_agent: needsUserAgent
      ? generateBrowserIdentity(profileId).userAgent
      : userAgent!.trim(),
  };
}
