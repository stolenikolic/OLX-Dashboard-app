/** Normalizuje feed spec vrijednosti u OLX-kompatibilan format. */

export function extractNumber(s: string): string | null {
  const m = s.match(/([\d.]+)/);
  return m ? m[1] : null;
}

export function isTruthyFlag(v: unknown): boolean {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return s === "yes" || s === "da" || s === "true" || s === "1";
}

/** Pretvara kapacitet u GB broj: 2000GB→2000, 28TB→28000, 1TB→1000. */
export function toGb(s: string): string | null {
  const normalized = s.replace(/\s+/g, "").toUpperCase();
  const tb =
    normalized.match(/^([\d.]+)\s*TB$/i) ?? normalized.match(/^([\d.]+)TB$/i);
  if (tb) {
    const n = Number(tb[1]);
    if (!Number.isFinite(n)) return null;
    return String(Math.round(n * 1000));
  }
  const gb =
    normalized.match(/^([\d.]+)\s*GB$/i) ?? normalized.match(/^([\d.]+)GB$/i);
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
  const tip = m[1];
  if (tip === "GDDR6X") return "GDDR6X";
  if (tip.startsWith("GDDR")) return tip;
  if (tip === "SDR") return "SDR";
  return tip;
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

/** Broj konektora → "0"|"1"|…|"4"|"5+" kao string broj (value map doradi Nema/Više). */
export function normalizeConnectorCount(s: string): string | null {
  const n = extractNumber(s);
  if (n == null) return null;
  const num = Number(n);
  if (!Number.isFinite(num) || num < 0) return null;
  if (num >= 5) return "Više";
  return String(Math.round(num));
}

export function normalizeSizeStandard(s: string): string {
  const t = s.trim().toLowerCase();
  if (t.includes("micro")) return "Micro ATX";
  if (t.includes("mini")) return "Ostalo";
  if (t.includes("eatx") || t.includes("xl-atx") || t.includes("xl atx")) {
    return "Full ATX";
  }
  if (
    t === "atx" ||
    t.startsWith("atx ") ||
    t.includes("full atx") ||
    t.includes("midi")
  ) {
    if (t.includes("midi")) return "Midi ATX";
    return "Full ATX";
  }
  return "Ostalo";
}

/** Monitor/TV dijagonala u cijeli inch. */
export function normalizeDiagonalInch(s: string): string | null {
  const n = extractNumber(s);
  if (!n) return null;
  const rounded = Math.round(Number(n));
  if (!Number.isFinite(rounded) || rounded < 5) return null;
  return String(rounded);
}

/** Monitor panel → OLX Vrsta (#369). */
export function normalizeMonitorPanel(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("qd oled") || t === "qd-oled") return "OLED";
  if (t.includes("oled")) return "OLED";
  if (t.includes("ips")) return "IPS";
  if (t.includes("va")) return "VA";
  if (t.includes("tn")) return "TN";
  if (t.includes("mini led") || t.includes("mini-led")) return "LED";
  if (t === "led" || t.includes("led")) return "LED";
  if (t.includes("lcd")) return "LCD";
  return "Ostalo";
}

/** Monitor refresh → OLX opcije ili null. */
export function normalizeRefreshRate(s: string): string | null {
  const n = extractNumber(s);
  if (!n) return null;
  const hz = Math.round(Number(n));
  const allowed = new Set([60, 75, 120, 144, 165, 180, 200, 240]);
  if (allowed.has(hz)) return String(hz);
  if (hz >= 230) return "240";
  if (hz >= 190) return "200";
  if (hz >= 170) return "180";
  if (hz >= 150) return "165";
  if (hz >= 130) return "144";
  if (hz >= 100) return "120";
  if (hz >= 70) return "75";
  if (hz >= 50) return "60";
  return "Ostalo";
}

/** Monitor max rezolucija (#1164). */
export function normalizeMonitorResolution(s: string): string | null {
  const t = s.replace(/\s+/g, " ").trim().toLowerCase();
  if (!t) return null;
  if (t.includes("3840") && t.includes("2160")) return "3840x2160";
  if (t.includes("3440") && t.includes("1440")) return "3440x1440";
  if (t.includes("2560") && t.includes("1440")) return "2560x1440";
  if (t.includes("2560") && t.includes("1080")) return "2560x1080";
  if (t.includes("1920") && t.includes("1200")) return "1920x1200";
  if (t.includes("1920") && t.includes("1080")) return "1920x1080";
  if (t.includes("1680") && t.includes("1050")) return "1680x1050";
  if (t.includes("1600") && t.includes("900")) return "1600x900";
  if (t.includes("1440") && t.includes("900")) return "1440x900";
  if (t.includes("1366") && t.includes("768")) return "1366x768";
  if (t.includes("1280") && t.includes("1024")) return "1280x1024";
  return "Ostalo";
}

/** TV rezolucija (#3459). */
export function normalizeTvResolution(s: string): string | null {
  const u = s.toUpperCase();
  if (!u.trim()) return null;
  if (u.includes("8K") || u.includes("7680")) return "8K";
  if (u.includes("4K") || u.includes("2160")) return "4K";
  if (u.includes("2K") || (u.includes("2560") && u.includes("1440"))) {
    return "2K";
  }
  if (u.includes("1080") || u.includes("FULL HD")) return "1080p (full HD)";
  if (u.includes("720")) return "720p";
  if (u.includes("768")) return "768p";
  return null;
}

/** TV tehnologija (#7525) — nepoznato → null (fallback). */
export function normalizeTvTechnology(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("neo qled")) return "NEO QLED";
  if (t.includes("qled")) return "QLED";
  if (t.includes("oled") || t.includes("woled")) return "OLED";
  if (t.includes("nanocell")) return "NanoCell";
  if (t.includes("mini led") || t.includes("mini-led")) return "MINI LED";
  if (t.includes("dled")) return "DLED";
  if (t.includes("uled")) return "ULED";
  if (t.includes("qd-mini") || t.includes("qd mini")) return "QD-Mini LED";
  if (t === "led" || t.includes("fald") || t.includes("led lcd")) {
    return "LED LCD";
  }
  if (t.includes("lcd")) return "LCD";
  if (t.includes("plazma") || t.includes("plasma")) return "Plazma";
  if (t.includes("qned")) return "QLED";
  return null;
}

/** Nadzorne kamere video rezolucija (#7445). */
export function normalizeCameraVideoResolution(s: string): string | null {
  const u = s.toLowerCase();
  if (!u.trim()) return null;
  if (u.includes("8k") || u.includes("7680")) return "8K";
  if (
    u.includes("4k") ||
    u.includes("3840") ||
    u.includes("2160") ||
    u.includes("2880")
  ) {
    return "4K";
  }
  if (u.includes("1080") || u.includes("1920")) return "1080p";
  if (u.includes("720") || u.includes("1280")) return "720p";
  return null;
}

export function normalizeCameraFromMegapixel(s: string): string | null {
  const n = extractNumber(s);
  if (!n) return null;
  const mp = Number(n);
  if (!Number.isFinite(mp) || mp <= 0) return null;
  if (mp >= 8) return "4K";
  if (mp >= 2) return "1080p";
  if (mp >= 1) return "720p";
  return "Ostalo";
}

/** Digitalni fotoaparati — Megapiksela (#527). */
export function normalizeMegapixelOlxRange(s: string): string | null {
  const n = extractNumber(s);
  if (!n) return null;
  const mp = Number(n);
  if (!Number.isFinite(mp) || mp <= 0) return null;
  if (mp < 3) return "do 3.0";
  if (mp < 4) return "3.0 do 3.9";
  if (mp < 5) return "4.0 do 4.9";
  if (mp < 6) return "5.0 do 5.9";
  if (mp < 7) return "6.0 do 6.9";
  if (mp < 8) return "7.0 do 7.9";
  if (mp < 10) return "8.0 do 9.9";
  if (mp < 12) return "10.0 do 11.9";
  if (mp < 14) return "12.0 do 13.9";
  if (mp < 16) return "14.0 do 15.9";
  if (mp < 18) return "16.0 do 17.9";
  if (mp >= 18) return "18 i više";
  return "Ostalo";
}

/** WiFi standard iz feed `wifi` polja. */
export function normalizeWifiStandard(s: string): string | null {
  const t = s.toLowerCase();
  if (!t.trim()) return null;
  if (t.includes("6e")) return "WiFi 6E";
  if (t.includes("wifi 7") || t.includes("wi-fi 7") || t.includes("/be")) {
    return "Ostalo";
  }
  if (t.includes("wifi 6") || t.includes("wi-fi 6") || t.includes("/ax")) {
    return "WiFi 6";
  }
  if (t.includes("wifi 5") || t.includes("wi-fi 5") || t.includes("/ac")) {
    return "WiFi 5";
  }
  if (t.includes("wifi 4") || t.includes("wi-fi 4") || t.includes("/n")) {
    return "WiFi 4";
  }
  return null;
}

/** Dual/Single band hint — inače null. */
export function normalizeWifiBand(s: string): string | null {
  const t = s.toLowerCase();
  if (t.includes("tri") || t.includes("6e") || t.includes("wifi 7")) {
    return "Ostalo";
  }
  if (t.includes("dual")) return "Dual band";
  if (t.includes("single")) return "Single band";
  // WiFi 5/6 tipično dual
  if (
    t.includes("wifi 5") ||
    t.includes("wi-fi 5") ||
    t.includes("wifi 6") ||
    t.includes("wi-fi 6") ||
    t.includes("/ac") ||
    t.includes("/ax")
  ) {
    return "Dual band";
  }
  return null;
}

export function normalizeSoundSystem(s: string): string | null {
  const t = s.trim();
  if (["2.0", "2.1", "5.1", "6.1", "7.1"].includes(t)) return t;
  if (t === "1.0" || t.toLowerCase().includes("soundbar")) return "Ostalo";
  if (t === "2.2") return "2.1";
  return null;
}

export function normalizePsuCertificate(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("titanium")) return "80 Plus Titanium";
  if (t.includes("platinum")) return "80 Plus Platinum";
  if (t.includes("gold")) return "80 Plus Gold";
  if (t.includes("silver")) return "80 Plus Silver";
  if (t.includes("bronze")) return "80 Plus Bronze";
  if (t.includes("white") || t === "80 plus") return "80 Plus";
  return null;
}

export function normalizePrintTechnology(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("ink")) return "Ink jet";
  if (t.includes("laser")) return "Laserski (crno bijelo)";
  if (t.includes("matri")) return "Matrični";
  if (t.includes("termal")) return "Termalni";
  if (t.includes("led")) return "Ostalo";
  if (t.includes("3d")) return "Ostalo";
  return "Ostalo";
}

export function normalizeOpticalDriveType(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("blu")) return "Blu ray";
  if (t.includes("dvd") && (t.includes("rw") || t.includes("r/w"))) {
    return "DVD RW";
  }
  if (t.includes("dvd") && t.includes("rom")) return "DVD ROM";
  if (t.includes("dvd") && t.endsWith("r")) return "DVD R";
  if (t.includes("dvd")) return "DVD RW";
  if (t.includes("cd") && (t.includes("rw") || t.includes("r/w"))) {
    return "CD R/RW";
  }
  if (t.includes("cd")) return "CD ROM";
  return "Ostalo";
}

/** Gaming stolovi — cm u OLX select opciju. */
export function normalizeFurnitureCm(s: string): string | null {
  const n = extractNumber(s);
  if (!n) return null;
  const cm = Math.round(Number(n));
  if (!Number.isFinite(cm) || cm <= 0) return null;
  if (cm < 40) return "Manje od 40";
  if (cm > 180 && cm > 100) {
    // visina opcije idu do "Više od 100"; širina/dužina do 180+
    if (cm > 180) return "Više od 180";
  }
  if (cm > 100 && cm <= 105) return "100";
  const step = Math.round(cm / 10) * 10;
  if (step < 40) return "Manje od 40";
  if (step > 180) return "Više od 180";
  return String(step);
}

export function normalizeOlxColor(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (t.includes("black") || t.includes("crn")) return "Crna";
  if (t.includes("white") || t.includes("bijel") || t.includes("bel")) {
    return "Bijela";
  }
  if (t.includes("grey") || t.includes("gray") || t.includes("siv")) {
    return "Siva";
  }
  if (t.includes("silver") || t.includes("srebr")) return "Srebrna";
  if (t.includes("red") || t.includes("crven")) return "Crvena";
  if (t.includes("blue") || t.includes("plav")) return "Plava";
  if (t.includes("green") || t.includes("zelen")) return "Zelena";
  if (t.includes("yellow") || t.includes("žut") || t.includes("zut")) {
    return "Žuta";
  }
  if (t.includes("orange") || t.includes("narand")) return "Narandžasta";
  if (t.includes("purple") || t.includes("ljubič") || t.includes("ljubic")) {
    return "Ljubičasta";
  }
  if (t.includes("pink") || t.includes("roz")) return "Roza";
  if (t.includes("gold") || t.includes("zlat")) return "Zlatna";
  if (t.includes("brown") || t.includes("smeđ") || t.includes("smed")) {
    return "Smeđa";
  }
  if (t.includes("beige") || t.includes("bež") || t.includes("bez")) {
    return "Bež";
  }
  if (t.includes("multi") || t.includes("više") || t.includes("rgb")) {
    return "Višebojna";
  }
  return null;
}

export function transformSpecValue(
  specKey: string,
  raw: unknown,
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  switch (specKey) {
    case "clock_speed":
    case "tdp":
    case "output_performance":
    case "fan_size":
    case "frequency":
    case "wifi_max_speed":
    case "sound_power":
    case "readspeed":
    case "writespeed":
    case "buffer":
    case "print_speed":
    case "print_resolution":
      return extractNumber(s);

    case "capacity":
      return toGb(s);

    case "memory_size":
      return normalizeGpuMemorySize(s);

    case "memory_type":
      return normalizeDdr(s);

    case "memory_sockets":
    case "sata3_connector":
    case "number_of_lan_ports":
      return normalizePcs(s);

    case "size_standard":
      return normalizeSizeStandard(s);

    case "screen_diagonal":
      return normalizeDiagonalInch(s);

    case "panel_type":
      return normalizeMonitorPanel(s);

    case "refresh_rate":
      return normalizeRefreshRate(s);

    case "resolution":
      // Koristi se na više kategorija — generički monitor stil;
      // TV/kamera koriste derived ključeve.
      return normalizeMonitorResolution(s);

    case "tv_technology":
      return normalizeTvTechnology(s);

    case "hdmi":
    case "displayport":
    case "dvi":
    case "vgad_sub":
    case "mini_displayport":
      return normalizeConnectorCount(s);

    case "certificate":
      return normalizePsuCertificate(s);

    case "modular":
    case "wireless":
    case "bluetooth":
    case "wifi":
    case "wifi_connector":
    case "infra_vision":
    case "woofer":
    case "mechanical":
    case "color_printing":
    case "poe":
    case "support_4k":
    case "mobile_app":
      return isTruthyFlag(s) ? "1" : null;

    case "sound_system":
      return normalizeSoundSystem(s);

    case "print_technology":
      return normalizePrintTechnology(s);

    case "optical_drive_type":
      return normalizeOpticalDriveType(s);

    case "rpm": {
      const n = extractNumber(s);
      if (!n) return null;
      const rpm = Math.round(Number(n));
      if ([5400, 7200, 10000, 15000].includes(rpm)) return String(rpm);
      return "Ostalo";
    }

    case "size_inch": {
      const t = s.replace(",", ".");
      if (t.includes("2.5")) return "2.5";
      if (t.includes("3.5")) return "3.5";
      return null;
    }

    case "width":
    case "depth":
    case "height":
      return normalizeFurnitureCm(s);

    case "color":
      return normalizeOlxColor(s);

    case "megapixel":
      return normalizeMegapixelOlxRange(s);

    case "__derived_prikljucak":
    case "__derived_keyboard_prikljucak":
    case "__derived_set_prikljucak":
    case "__derived_ram_vrsta":
    case "__derived_procesor":
    case "__derived_ram_quantity":
    case "__derived_tv_resolution":
    case "__derived_camera_resolution":
    case "__derived_ap_wifi_standard":
    case "__derived_ap_band":
    case "__derived_mb_memory_type":
      return s;

    default:
      return s;
  }
}

/** Iz wireless/usb/ps2 feed polja → OLX priključak za miševe. */
export function deriveMouseConnector(
  specs: Record<string, unknown>,
): string | null {
  if (isTruthyFlag(specs.wireless)) return "Wireless (bežični)";
  if (isTruthyFlag(specs.ps2_port)) return "PS/2";
  if (isTruthyFlag(specs.usb_connector)) return "USB";
  return null;
}

/** Tastature / set: OLX opcija "Wireless" (bez "bežični"). */
export function deriveKeyboardConnector(
  specs: Record<string, unknown>,
): string | null {
  if (isTruthyFlag(specs.wireless) || isTruthyFlag(specs.bluetooth)) {
    return "Wireless";
  }
  if (isTruthyFlag(specs.ps2_port)) return "PS/2";
  if (isTruthyFlag(specs.usb_connector)) return "USB";
  return null;
}

/** Desktop PC vs Laptop iz memory_type. */
export function deriveRamFormFactor(
  specs: Record<string, unknown>,
): string | null {
  const mt = String(specs.memory_type ?? "").toLowerCase();
  if (!mt) return null;
  if (
    mt.includes("notebook") ||
    mt.includes("so-dimm") ||
    mt.includes("sodimm")
  ) {
    return "Laptop";
  }
  return "Desktop PC";
}

/** AMD/Intel iz chipset manufacturer polja (feed ima tipfeler chipseet_). */
export function deriveMbProcessor(
  specs: Record<string, unknown>,
): string | null {
  const raw = specs.chipseet_manufacturer ?? specs.chipset_manufacturer;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!s) return null;
  if (s.includes("amd")) return "AMD";
  if (s.includes("intel")) return "Intel";
  return "Ostalo";
}

export function deriveTvResolution(
  specs: Record<string, unknown>,
): string | null {
  if (specs.resolution == null) return null;
  return normalizeTvResolution(String(specs.resolution));
}

export function deriveCameraResolution(
  specs: Record<string, unknown>,
): string | null {
  if (specs.resolution != null) {
    const fromRes = normalizeCameraVideoResolution(String(specs.resolution));
    if (fromRes) return fromRes;
  }
  if (specs.megapixel != null) {
    return normalizeCameraFromMegapixel(String(specs.megapixel));
  }
  return null;
}

export function deriveMbMemoryType(
  specs: Record<string, unknown>,
): string | null {
  if (specs.memory_type == null) return null;
  const ddr = normalizeDdr(String(specs.memory_type));
  if (["DDR", "DDR2", "DDR3", "DDR4", "DDR5"].includes(ddr)) return ddr;
  return null;
}

/** Dodaje derived ključeve u kopiju specs objekta. */
export function withDerivedSpecs(
  specs: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...specs };

  const mouse = deriveMouseConnector(specs);
  if (mouse) out.__derived_prikljucak = mouse;

  const keyboard = deriveKeyboardConnector(specs);
  if (keyboard) {
    out.__derived_keyboard_prikljucak = keyboard;
    out.__derived_set_prikljucak = keyboard;
  }

  const ramVrsta = deriveRamFormFactor(specs);
  if (ramVrsta) out.__derived_ram_vrsta = ramVrsta;

  const mbProc = deriveMbProcessor(specs);
  if (mbProc) out.__derived_procesor = mbProc;

  if (specs.memory_size != null && String(specs.memory_size).trim()) {
    out.__derived_ram_quantity = normalizeRamQuantity(
      String(specs.memory_size),
    );
  }

  const tvRes = deriveTvResolution(specs);
  if (tvRes) out.__derived_tv_resolution = tvRes;

  const camRes = deriveCameraResolution(specs);
  if (camRes) out.__derived_camera_resolution = camRes;

  if (specs.wifi != null && String(specs.wifi).trim()) {
    const wifiStr = String(specs.wifi);
    const std = normalizeWifiStandard(wifiStr);
    if (std) out.__derived_ap_wifi_standard = std;
    const band = normalizeWifiBand(wifiStr);
    if (band) out.__derived_ap_band = band;
  }

  const mbMem = deriveMbMemoryType(specs);
  if (mbMem) out.__derived_mb_memory_type = mbMem;

  return out;
}
