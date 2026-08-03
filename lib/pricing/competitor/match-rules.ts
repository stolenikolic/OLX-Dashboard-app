import { OLX_CAT } from "@/lib/pricing/competitor/normalize-title";

const DEFAULT_WORD_MATCH_RATIO = 0.8;

function wordTokens(s: string): string[] {
  return s
    .toUpperCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

function hasLetterAndDigit(word: string): boolean {
  return /[a-zA-Z]/.test(word) && /\d/.test(word);
}

/** Model-like tokens (e.g. 5700X, I5-12400F, B550) — svi moraju biti u oglasu. */
function modelTokens(s: string): string[] {
  return wordTokens(s).filter(hasLetterAndDigit);
}

/**
 * Default: ≥80% riječi + SVI alfanumerički model tokeni moraju biti u oglasu.
 * Sprječava 5700X ↔ 7400 i slične lažne poklapanja.
 */
function matchesDefault(ourTitle: string, adTitle: string): boolean {
  const ours = wordTokens(ourTitle);
  if (ours.length === 0) return false;
  const ad = adTitle.toUpperCase();

  for (const m of modelTokens(ourTitle)) {
    if (!ad.includes(m)) return false;
  }

  let hits = 0;
  for (const w of ours) {
    if (ad.includes(w)) hits++;
  }
  return hits / ours.length >= DEFAULT_WORD_MATCH_RATIO;
}

function chooseMouse(our: string, ad: string): boolean {
  const a = our.toUpperCase();
  const b = ad.toUpperCase();

  for (const f of ["I", "II", "III"]) {
    if (a.includes(f) && !b.includes(f)) return false;
  }

  for (const f of ["D-", "O-", "PRO", "MATT", "CORE", "AIMPOINT", "MINI"]) {
    if ((a.includes(f) && !b.includes(f)) || (b.includes(f) && !a.includes(f))) {
      return false;
    }
  }

  if (
    (a.includes("STEELSERIES") || a.includes("HP") || a.includes("XTRFY")) &&
    b.includes("WIRELESS") &&
    !a.includes("WIRELESS")
  ) {
    return false;
  }

  return matchesDefault(our, ad);
}

function chooseSsd(our: string, ad: string): boolean {
  const a = our.toUpperCase();
  const b = ad.toUpperCase();
  for (const word of a.split(/\s+/).filter(Boolean)) {
    if (!b.includes(word)) return false;
  }
  return true;
}

function chooseMbo(our: string, ad: string): boolean {
  const a = our.toUpperCase();
  const b = ad.toUpperCase();

  if (b.includes("D4") && !a.includes("D4")) return false;
  if (b.includes("DDR4") && !a.includes("DDR4")) return false;

  for (const word of a.split(/\s+/).filter(Boolean)) {
    if (!b.includes(word)) return false;
  }
  return true;
}

function choosePsu(our: string, ad: string): boolean {
  const a = our.toUpperCase();
  const b = ad.toUpperCase();
  if (a.includes("BE QUIET!") && b.includes("M") && !a.includes("M")) {
    return false;
  }
  return matchesDefault(our, ad);
}

/** Arctis Nova generacija: 1, 5, 7, 7P … */
function arctisNovaGeneration(title: string): string | null {
  const m = title.toUpperCase().match(/\bNOVA\s+(\d+[A-Z]{0,2})\b/);
  return m ? m[1] : null;
}

function hasArctisNovaPro(title: string): boolean {
  return /\bNOVA\s+PRO\b/.test(title.toUpperCase());
}

function symmetricFlag(a: string, b: string, flag: string): boolean {
  const inA = a.includes(flag);
  const inB = b.includes(flag);
  return inA === inB;
}

function chooseHeadset(our: string, ad: string): boolean {
  const a = our.toUpperCase();
  const b = ad.toUpperCase();

  for (const f of ["I", "II", "III"]) {
    if (a.includes(f) && !b.includes(f)) return false;
  }

  // Logitech G-serija — tačan model (G733 ≠ G435).
  const ourG = a.match(/\bG\d{3,4}\b/);
  const adG = b.match(/\bG\d{3,4}\b/);
  if (ourG || adG) {
    if (!ourG || !adG || ourG[0] !== adG[0]) return false;
  }

  // Arctis Nova — ista generacija (Nova 5 ≠ Nova 7 / 7P / 1).
  const ourNova = arctisNovaGeneration(a);
  const adNova = arctisNovaGeneration(b);
  if (ourNova || adNova) {
    if (!ourNova || !adNova || ourNova !== adNova) return false;
  }

  // Nova vs Nova Pro — različit SKU.
  if (hasArctisNovaPro(a) !== hasArctisNovaPro(b)) return false;

  // Wireless / platform varijante moraju se poklapati.
  if (!symmetricFlag(a, b, "WIRELESS")) return false;
  for (const f of ["7P", "7X", "XBOX", "PLAYSTATION", "PS5", "PS4"]) {
    if (!symmetricFlag(a, b, f)) return false;
  }

  return matchesDefault(our, ad);
}

function chooseWaterCooler(our: string, ad: string): boolean {
  const a = our.toUpperCase();
  const b = ad.toUpperCase();

  if (a.includes("DEEPCOOL")) {
    if (
      (b.includes("SE") && !a.includes("SE")) ||
      (/MARRS/i.test(ad) && !/MARRS/i.test(our))
    ) {
      return false;
    }
  }

  if (a.includes("ENERMAX") && b.includes("SR") && !a.includes("SR")) {
    return false;
  }

  return matchesDefault(our, ad);
}

function chooseRam(our: string, ad: string): boolean {
  let a = our.toUpperCase();
  let b = ad.toUpperCase();

  if (a.includes("KIT")) {
    a = a.split("KIT")[0] + "KIT";
  } else {
    const cl = a.indexOf("CL");
    if (cl !== -1) a = a.slice(0, cl + 4);
  }

  if (b.includes("KIT")) {
    b = b.split("KIT")[0] + "KIT";
  } else {
    const cl = b.indexOf("CL");
    if (cl !== -1) b = b.slice(0, cl + 4);
  }

  return a.split(/\s+/).join(" ") === b.split(/\s+/).join(" ");
}

type CpuPackage = "BOX" | "OEM" | "TRAY" | "UNKNOWN";

function cpuPackage(title: string): CpuPackage {
  const t = title.toUpperCase();
  if (/\bOEM\b/.test(t)) return "OEM";
  if (/\b(SPK|TRAY)\b/.test(t)) return "TRAY";
  // WOF = box without cooler — tretiraj kao BOX
  if (/\bBOX\b/.test(t) || /\bWOF\b/.test(t)) return "BOX";
  return "UNKNOWN";
}

type CpuIdentity = {
  brand: "AMD" | "INTEL" | null;
  series: string | null;
  model: string | null;
  socket: string | null;
  pkg: CpuPackage;
};

/**
 * Izvuci identitet CPU-a (AMD Ryzen / Intel).
 * Model mora biti tačan: 5700X ≠ 5700 ≠ 5700G.
 */
function parseCpuIdentity(title: string): CpuIdentity {
  const t = title.toUpperCase();
  const pkg = cpuPackage(t);

  const socketMatch = t.match(/\b(AM[45]|LGA\s?\d{3,4}|SOCKET\s?\d{3,4})\b/);
  const socket = socketMatch
    ? socketMatch[1].replace(/\s+/g, "")
    : null;

  // AMD Ryzen 7 5700X
  const amd = t.match(/\bRYZEN\s*([3579])\s+([0-9]{3,5}[A-Z]{0,3})\b/);
  if (amd) {
    return {
      brand: "AMD",
      series: amd[1],
      model: amd[2],
      socket,
      pkg,
    };
  }

  // Fallback: sam model tipa 5700X uz AMD
  if (/\bAMD\b/.test(t)) {
    const m = t.match(/\b([0-9]{4,5}[A-Z]{0,3})\b/);
    if (m) {
      return { brand: "AMD", series: null, model: m[1], socket, pkg };
    }
  }

  // Intel Core i5-12400F / I5 12400F / i5-12400
  const intel = t.match(/\bI([3579])[-\s]?([0-9]{3,5}[A-Z]{0,3})\b/);
  if (intel) {
    return {
      brand: "INTEL",
      series: intel[1],
      model: intel[2],
      socket,
      pkg,
    };
  }

  return { brand: null, series: null, model: null, socket, pkg };
}

function chooseCpu(our: string, ad: string): boolean {
  const a = parseCpuIdentity(our);
  const b = parseCpuIdentity(ad);

  // Bez prepoznatog modela — stroži default (svi model tokeni)
  if (!a.model) {
    return matchesDefault(our, ad);
  }
  if (!b.model) return false;

  if (a.model !== b.model) return false;

  if (a.brand && b.brand && a.brand !== b.brand) return false;
  if (a.series && b.series && a.series !== b.series) return false;

  if (a.socket && b.socket && a.socket !== b.socket) return false;

  // BOX ↔ OEM / TRAY se ne miješa
  if (
    a.pkg !== "UNKNOWN" &&
    b.pkg !== "UNKNOWN" &&
    a.pkg !== b.pkg
  ) {
    return false;
  }

  return true;
}

/**
 * Category-aware match validation.
 * CPU i default traže tačan model; labave kategorije + word/model overlap.
 */
export function matchesRule(
  olxCategoryId: number | null,
  ourTitle: string,
  adTitle: string,
): boolean {
  switch (olxCategoryId) {
    case OLX_CAT.motherboard:
      return chooseMbo(ourTitle, adTitle);
    case OLX_CAT.mouse:
      return chooseMouse(ourTitle, adTitle);
    case OLX_CAT.internal_ssd:
      return chooseSsd(ourTitle, adTitle);
    case OLX_CAT.water_cooling:
      return chooseWaterCooler(ourTitle, adTitle);
    case OLX_CAT.power_supply:
      return choosePsu(ourTitle, adTitle);
    case OLX_CAT.headset:
      return chooseHeadset(ourTitle, adTitle);
    case OLX_CAT.memory:
      return chooseRam(ourTitle, adTitle);
    case OLX_CAT.cpu:
      return chooseCpu(ourTitle, adTitle);
    default:
      return matchesDefault(ourTitle, adTitle);
  }
}
