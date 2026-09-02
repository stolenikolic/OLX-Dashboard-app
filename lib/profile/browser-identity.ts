import { fnv1a } from "@/lib/workers/profile-shuffle";

/**
 * Koherentan set browser headera po profilu — anti-detekcija.
 * User-Agent, Client Hints (sec-ch-ua-*) i Accept-Language MORAJU se slagati
 * (npr. Firefox nikad ne šalje sec-ch-ua), inače je nesklad sam po sebi potpis.
 */
export type BrowserIdentity = {
  userAgent: string;
  /** null za browsere koji ne šalju Client Hints (npr. Firefox). */
  secChUa: string | null;
  secChUaMobile: string | null;
  secChUaPlatform: string | null;
  acceptLanguage: string;
};

type BrowserTemplate = {
  name: string;
  versions: readonly number[];
  buildUserAgent: (version: number) => string;
  buildSecChUa: ((version: number) => string) | null;
  secChUaMobile: string | null;
  secChUaPlatform: string | null;
};

/** Aktuelni Chrome/Edge major opseg (reduced UA format — samo major.0.0.0). */
const CHROME_VERSIONS = [138, 139, 140, 141, 142] as const;
const FIREFOX_VERSIONS = [128, 129, 130, 131, 132] as const;

const TEMPLATES: readonly BrowserTemplate[] = [
  {
    name: "chrome-windows",
    versions: CHROME_VERSIONS,
    buildUserAgent: (v) =>
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
    buildSecChUa: (v) =>
      `"Not)A;Brand";v="99", "Google Chrome";v="${v}", "Chromium";v="${v}"`,
    secChUaMobile: "?0",
    secChUaPlatform: `"Windows"`,
  },
  {
    name: "chrome-macos",
    versions: CHROME_VERSIONS,
    buildUserAgent: (v) =>
      `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`,
    buildSecChUa: (v) =>
      `"Not)A;Brand";v="99", "Google Chrome";v="${v}", "Chromium";v="${v}"`,
    secChUaMobile: "?0",
    secChUaPlatform: `"macOS"`,
  },
  {
    name: "edge-windows",
    versions: CHROME_VERSIONS,
    buildUserAgent: (v) =>
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36 Edg/${v}.0.0.0`,
    buildSecChUa: (v) =>
      `"Not)A;Brand";v="99", "Microsoft Edge";v="${v}", "Chromium";v="${v}"`,
    secChUaMobile: "?0",
    secChUaPlatform: `"Windows"`,
  },
  {
    name: "firefox-windows",
    versions: FIREFOX_VERSIONS,
    buildUserAgent: (v) =>
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${v}.0) Gecko/20100101 Firefox/${v}.0`,
    // Firefox ne šalje sec-ch-ua headere.
    buildSecChUa: null,
    secChUaMobile: null,
    secChUaPlatform: null,
  },
] as const;

const ACCEPT_LANGUAGES = [
  "bs-BA,bs;q=0.9,en-US;q=0.8,en;q=0.7",
  "hr-HR,hr;q=0.9,en-US;q=0.8,en;q=0.7",
  "sr-BA,sr;q=0.9,en-US;q=0.8,en;q=0.7",
  "bs-BA,bs;q=0.9,hr;q=0.8,en;q=0.7",
] as const;

/** Deterministički, stabilan po profilu — isti profil uvijek dobija isti identitet. */
export function generateBrowserIdentity(profileId: string): BrowserIdentity {
  const template =
    TEMPLATES[fnv1a(`ua-template:${profileId}`) % TEMPLATES.length]!;
  const version =
    template.versions[
      fnv1a(`ua-version:${profileId}`) % template.versions.length
    ]!;
  const acceptLanguage =
    ACCEPT_LANGUAGES[
      fnv1a(`ua-lang:${profileId}`) % ACCEPT_LANGUAGES.length
    ]!;

  return {
    userAgent: template.buildUserAgent(version),
    secChUa: template.buildSecChUa ? template.buildSecChUa(version) : null,
    secChUaMobile: template.secChUaMobile,
    secChUaPlatform: template.secChUaPlatform,
    acceptLanguage,
  };
}

/**
 * Prepoznaje stare/nevaljane generisane User-Agent vrijednosti
 * (generički "api_integration" default ili nepostojeći "Chrome/12XX" iz
 * starog generatora) da bi se forsirala jednokratna regeneracija.
 */
export function isLegacyUserAgent(
  userAgent: string | null | undefined,
): boolean {
  if (!userAgent?.trim()) return true;
  if (userAgent === "api_integration") return true;
  if (/Chrome\/12\d\d\./.test(userAgent)) return true;
  return false;
}
