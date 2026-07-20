/** Normalizuje feed spec vrijednosti u OLX-kompatibilan format. */

export function extractNumber(s: string): string | null {
  const m = s.match(/([\d.]+)/);
  return m ? m[1] : null;
}

/** Pretvara kapacitet u GB broj: 2000GB→2000, 28TB→28000, 1TB→1000. */
export function toGb(s: string): string | null {
  const normalized = s.replace(/\s+/g, "").toUpperCase();
  const tb = normalized.match(/^([\d.]+)\s*TB$/i) ?? normalized.match(/^([\d.]+)TB$/i);
  if (tb) {
    const n = Number(tb[1]);
    if (!Number.isFinite(n)) return null;
    return String(Math.round(n * 1000));
  }
  const gb = normalized.match(/^([\d.]+)\s*GB$/i) ?? normalized.match(/^([\d.]+)GB$/i);
  if (gb) {
    const n = Number(gb[1]);
    if (!Number.isFinite(n)) return null;
    return String(Math.round(n));
  }
  const bare = extractNumber(s);
  return bare;
}

/** DDR tip: strip /CUDIMM, Notebook/SO-DIMM prefikse → DDR4/DDR5/… */
export function normalizeDdr(s: string): string {
  const upper = s.toUpperCase();
  const m = upper.match(/\b(DDR\d*|SDR|GDDR\d*X?)\b/);
  if (!m) return s.trim();
  let tip = m[1];
  if (tip === "GDDR6X") return "GDDR6X";
  if (tip.startsWith("GDDR")) return tip;
  if (tip === "SDR") return "SDR";
  return tip; // DDR, DDR2, …
}

/**
 * GPU VRAM opcije na OLX-u: većina sa razmakom ("4 GB"), izuzetak "8GB".
 */
export function normalizeGpuMemorySize(s: string): string {
  const gb = toGb(s);
  if (!gb) return s.trim();
  if (gb === "8") return "8GB";
  return `${gb} GB`;
}

/** RAM količina: "8 GB", "32 GB", … */
export function normalizeRamQuantity(s: string): string {
  const gb = toGb(s);
  if (!gb) return s.trim();
  return `${gb} GB`;
}

export function normalizePcs(s: string): string {
  const n = extractNumber(s);
  return n ?? s.trim();
}

export function normalizeSizeStandard(s: string): string {
  const t = s.trim().toLowerCase();
  if (t.includes("micro")) return "Micro ATX";
  if (t.includes("mini")) return "Ostalo";
  if (t.includes("eatx") || t.includes("xl-atx") || t.includes("xl atx")) {
    return "Full ATX";
  }
  if (t === "atx" || t.startsWith("atx ") || t.includes("full atx") || t.includes("midi")) {
    if (t.includes("midi")) return "Midi ATX";
    return "Full ATX";
  }
  return "Ostalo";
}

export function transformSpecValue(specKey: string, raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  switch (specKey) {
    case "clock_speed":
    case "tdp":
    case "output_performance":
    case "fan_size":
    case "frequency":
      return extractNumber(s) ?? s;

    case "capacity":
      return toGb(s) ?? s;

    case "memory_size":
      // GPU (#1740) vs RAM (#3077) dijele ključ — RAM mapiranje koristi
      // value_mappings / normalizeRamQuantity preko derived; ovdje GPU stil.
      return normalizeGpuMemorySize(s);

    case "memory_type":
      return normalizeDdr(s);

    case "memory_sockets":
    case "sata3_connector":
      return normalizePcs(s);

    case "size_standard":
      return normalizeSizeStandard(s);

    case "__derived_prikljucak":
    case "__derived_ram_vrsta":
    case "__derived_procesor":
    case "__derived_ram_quantity":
      return s;

    default:
      return s;
  }
}

/** Iz wireless/usb/ps2 feed polja → OLX priključak za miševe. */
export function deriveMouseConnector(specs: Record<string, unknown>): string | null {
  const yes = (v: unknown) => String(v ?? "").trim().toLowerCase() === "yes";
  if (yes(specs.wireless)) return "Wireless (bežični)";
  if (yes(specs.ps2_port)) return "PS/2";
  if (yes(specs.usb_connector)) return "USB";
  return null;
}

/** Desktop PC vs Laptop iz memory_type. */
export function deriveRamFormFactor(specs: Record<string, unknown>): string | null {
  const mt = String(specs.memory_type ?? "").toLowerCase();
  if (!mt) return null;
  if (mt.includes("notebook") || mt.includes("so-dimm") || mt.includes("sodimm")) {
    return "Laptop";
  }
  return "Desktop PC";
}

/** AMD/Intel iz chipset manufacturer polja (feed ima tipfeler chipseet_). */
export function deriveMbProcessor(specs: Record<string, unknown>): string | null {
  const raw = specs.chipseet_manufacturer ?? specs.chipset_manufacturer;
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s.includes("amd")) return "AMD";
  if (s.includes("intel")) return "Intel";
  return "Ostalo";
}

/** Dodaje derived ključeve u kopiju specs objekta. */
export function withDerivedSpecs(
  specs: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...specs };

  const mouse = deriveMouseConnector(specs);
  if (mouse) out.__derived_prikljucak = mouse;

  const ramVrsta = deriveRamFormFactor(specs);
  if (ramVrsta) out.__derived_ram_vrsta = ramVrsta;

  const mbProc = deriveMbProcessor(specs);
  if (mbProc) out.__derived_procesor = mbProc;

  // RAM količina: koristi memory_size sa razmakom "8 GB"
  if (specs.memory_size != null && String(specs.memory_size).trim()) {
    const ramQty = normalizeRamQuantity(String(specs.memory_size));
    out.__derived_ram_quantity = ramQty;
  }

  return out;
}
