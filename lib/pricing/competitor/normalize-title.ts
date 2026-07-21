/** OLX category IDs used by normalize / match rules. */
export const OLX_CAT = {
  motherboard: 160,
  water_cooling: 152,
  power_supply: 1042,
  mouse: 162,
  cpu: 167,
  internal_ssd: 155,
  memory: 161,
  headset: 1499,
  keyboard: 170,
  mouse_keyboard_set: 1521,
  speaker: 1496,
} as const;

function hasLetterAndDigit(word: string): boolean {
  return /[a-zA-Z]/.test(word) && /\d/.test(word);
}

function collapseSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function searchCpu(itemName: string): string {
  const words = itemName.split(/\s+/);
  const optimized: string[] = [];
  for (const word of words) {
    if (/ghz/i.test(word)) break;
    optimized.push(word);
  }
  let result = optimized.join(" ");
  if (/\bBOX\b/i.test(itemName)) result += " BOX";
  return result;
}

function searchRam(itemName: string): string {
  if (/KIT/i.test(itemName)) {
    return itemName.split(/KIT/i)[0] + "KIT";
  }
  const clIndex = itemName.toUpperCase().indexOf("CL");
  if (clIndex !== -1) {
    return itemName.slice(0, clIndex + 4);
  }
  return itemName;
}

function searchSsd(itemName: string): string {
  let name = itemName.toUpperCase();
  if (name.includes("M.2")) {
    name = name.split("M.2")[0] + "M.2";
  }
  if (name.includes("SATA")) {
    name = name.split("SATA")[0] + "SATA";
  }
  return name;
}

function searchMouse(title: string): string {
  let t = title;
  const upper = t.toUpperCase();
  if (
    (upper.includes("HP") || upper.includes("LOGITECH")) &&
    upper.includes("WIRELESS")
  ) {
    const index = upper.indexOf("WIRELESS");
    t = t.slice(0, index).trim();
  }

  t = t.toUpperCase();
  t = t.replace(/GAMING MOUSE/g, "").replace(/MOUSE/g, "");

  if (t.includes("LOGITECH")) {
    t = t.replace(/BLUETOOTH/g, "");
    if (t.includes("WIRELESS")) {
      const index = t.indexOf("WIRELESS");
      t = t.slice(0, index + "WIRELESS".length).trim();
    }
    if (t.includes("WIRED")) {
      const index = t.indexOf("WIRED");
      t = t.slice(0, index).trim();
    }
  }

  return collapseSpaces(t);
}

function searchHeadset(title: string): string {
  let t = title;
  if (/LOGITECH/i.test(t) && (/G733/i.test(t) || /G435/i.test(t))) {
    t = t.split(/\s+/).slice(0, 3).join(" ");
  }
  t = t.replace(/aktív zajkioltással/gi, "active noise cancellation");
  return t;
}

function searchKeyboard(title: string): string {
  return title.slice(0, 55);
}

function searchMkset(title: string): string {
  let t = title.slice(0, 55);
  const words = t.split(/\s+/);
  const brands = ["LOGITECH", "DELL", "REDRAGON", "ASUS", "GIGABYTE", "MSI"];

  if (
    /MSI/i.test(t) &&
    words[3] &&
    hasLetterAndDigit(words[3])
  ) {
    t = words.slice(0, 4).join(" ");
  } else if (
    /LOGITECH/i.test(t) &&
    words[2] &&
    hasLetterAndDigit(words[2])
  ) {
    t = words.slice(0, 3).join(" ");
  } else if (
    words[0] &&
    brands.includes(words[0].toUpperCase()) &&
    words[1] &&
    hasLetterAndDigit(words[1])
  ) {
    t = words.slice(0, 2).join(" ");
  }

  return t;
}

function searchSpeaker(title: string): string {
  let words = title.split(/\s+/);
  if (words[1] && hasLetterAndDigit(words[1])) {
    if (words[0]?.toUpperCase() === "GENIUS") {
      words = words.slice(0, 3);
    } else {
      words = words.slice(0, 2);
    }
  }
  const soundbarIdx = words.findIndex((w) => /soundbar/i.test(w));
  if (soundbarIdx >= 0) {
    words = words.slice(0, soundbarIdx);
  }
  return words.join(" ");
}

function searchCase(title: string): string {
  const words = title.split(/\s+/);
  if (
    words[0]?.toUpperCase() === "MS" &&
    words[1]?.toUpperCase() === "INDUSTRIAL"
  ) {
    return [words[0], ...words.slice(2)].join(" ");
  }
  return title;
}

function searchMbo(title: string): string {
  if (/rev\./i.test(title)) {
    const parts = title.split(/\s+/);
    return parts.slice(0, Math.max(0, parts.length - 2)).join(" ");
  }
  return title;
}

/**
 * Category-aware title normalization for competitor matching.
 * Port of Python search_title.py (cleaned).
 */
export function normalizeForCategory(
  title: string,
  olxCategoryId: number | null,
): string {
  let t = title.trim();
  if (!t) return "";

  switch (olxCategoryId) {
    case OLX_CAT.mouse:
      t = searchMouse(t);
      break;
    case OLX_CAT.cpu:
      t = searchCpu(t);
      break;
    case OLX_CAT.internal_ssd:
      t = searchSsd(t);
      break;
    case OLX_CAT.memory:
      t = searchRam(t);
      break;
    case OLX_CAT.headset:
      t = searchHeadset(t);
      break;
    case OLX_CAT.keyboard:
      t = searchKeyboard(t);
      break;
    case OLX_CAT.mouse_keyboard_set:
      t = searchMkset(t);
      break;
    case OLX_CAT.speaker:
      t = searchSpeaker(t);
      break;
    case OLX_CAT.motherboard:
      t = searchMbo(t);
      break;
    default:
      // case-like titles: light cleanup
      t = searchCase(t);
      break;
  }

  return collapseSpaces(t.toUpperCase());
}

/** Generic uppercase + collapse spaces. */
export function normalizeGeneric(title: string): string {
  return collapseSpaces(title.toUpperCase());
}
