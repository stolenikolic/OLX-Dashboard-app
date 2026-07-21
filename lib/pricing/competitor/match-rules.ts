import { OLX_CAT } from "@/lib/pricing/competitor/normalize-title";

const DEFAULT_WORD_MATCH_RATIO = 0.8;

function wordTokens(s: string): string[] {
  return s
    .toUpperCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

/** Default: ≥80% of our title words must appear in the competitor title. */
function matchesDefault(ourTitle: string, adTitle: string): boolean {
  const ours = wordTokens(ourTitle);
  if (ours.length === 0) return false;
  const ad = adTitle.toUpperCase();
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

  return true;
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
  return true;
}

function chooseHeadset(our: string, ad: string): boolean {
  const a = our.toUpperCase();
  const b = ad.toUpperCase();
  for (const f of ["I", "II", "III"]) {
    if (a.includes(f) && !b.includes(f)) return false;
  }
  return true;
}

function chooseWaterCooler(our: string, ad: string): boolean {
  const a = our.toUpperCase();
  const b = ad.toUpperCase();

  if (a.includes("DEEPCOOL")) {
    if ((b.includes("SE") && !a.includes("SE")) ||
        (/MARRS/i.test(ad) && !/MARRS/i.test(our))) {
      return false;
    }
  }

  if (a.includes("ENERMAX") && b.includes("SR") && !a.includes("SR")) {
    return false;
  }

  return true;
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

/**
 * Category-aware match validation.
 * Port of Python choose_item.py (cleaned). Categories without a
 * specific rule use ≥80% word overlap (plan Q24).
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
    default:
      return matchesDefault(ourTitle, adTitle);
  }
}
