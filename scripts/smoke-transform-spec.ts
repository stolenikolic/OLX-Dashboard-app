/**
 * Smoke test for transformSpecValue / withDerivedSpecs (no DB).
 * Run: npx tsx scripts/smoke-transform-spec.ts
 */
import {
  deriveKeyboardConnector,
  deriveMbProcessor,
  deriveMouseConnector,
  deriveRamFormFactor,
  normalizeDiagonalInch,
  normalizeMonitorPanel,
  normalizeTvResolution,
  transformSpecValue,
  withDerivedSpecs,
} from "../lib/listings/transform-spec";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok: ${msg}`);
}

console.log("transformSpecValue");
assert(transformSpecValue("capacity", "2000GB") === "2000", "capacity 2000GB");
assert(transformSpecValue("capacity", "28TB") === "28000", "capacity 28TB");
assert(transformSpecValue("capacity", "1TB") === "1000", "capacity 1TB");
assert(transformSpecValue("output_performance", "850 W") === "850", "PSU watts");
assert(transformSpecValue("memory_sockets", "4pcs") === "4", "pcs");
assert(transformSpecValue("memory_size", "4GB") === "4 GB", "GPU VRAM 4GB");
assert(transformSpecValue("memory_size", "8 GB") === "8GB", "GPU VRAM 8GB");
assert(transformSpecValue("memory_type", "DDR5/CUDIMM") === "DDR5", "DDR normalize");
assert(transformSpecValue("memory_type", "GDDR6X") === "GDDR6X", "GDDR6X");
assert(transformSpecValue("size_standard", "Micro ATX") === "Micro ATX", "case micro");
assert(transformSpecValue("size_standard", "EATX rear connection") === "Full ATX", "case eatx");
assert(transformSpecValue("fan_size", "120 mm") === "120", "fan size");
assert(normalizeDiagonalInch("23.8 inch") === "24", "diagonal round");
assert(normalizeMonitorPanel("IPS") === "IPS", "panel ips");
assert(normalizeMonitorPanel("QD OLED") === "OLED", "panel qd oled");
assert(normalizeTvResolution("3840 x 2160 4K UHD") === "4K", "tv 4k");
assert(transformSpecValue("hdmi", "2pcs") === "2", "hdmi count");
assert(transformSpecValue("hdmi", "0 pcs") === "0", "hdmi zero");
assert(transformSpecValue("wireless", "Da") === "1", "wireless da");
assert(transformSpecValue("wireless", "Ne") === null, "wireless ne");
assert(transformSpecValue("certificate", "80 Plus Gold") === "80 Plus Gold", "psu gold");
assert(transformSpecValue("sound_system", "2.1") === "2.1", "sound 2.1");
assert(transformSpecValue("refresh_rate", "170 Hz") === "180", "refresh snap");

console.log("derived");
assert(
  deriveMouseConnector({ wireless: "Yes", usb_connector: "Yes" }) ===
    "Wireless (bežični)",
  "mouse wireless",
);
assert(
  deriveMouseConnector({ wireless: "Da", usb_connector: "Da" }) ===
    "Wireless (bežični)",
  "mouse wireless da",
);
assert(
  deriveMouseConnector({ wireless: "No", usb_connector: "Yes" }) === "USB",
  "mouse usb",
);
assert(
  deriveKeyboardConnector({ wireless: "Da" }) === "Wireless",
  "keyboard wireless",
);
assert(
  deriveRamFormFactor({ memory_type: "Notebook DDR5 (SO-DIMM)" }) === "Laptop",
  "ram laptop",
);
assert(deriveRamFormFactor({ memory_type: "DDR5" }) === "Desktop PC", "ram desktop");
assert(deriveMbProcessor({ chipseet_manufacturer: "Intel" }) === "Intel", "mb intel");
assert(deriveMbProcessor({ chipset_manufacturer: "AMD" }) === "AMD", "mb amd");

const eff = withDerivedSpecs({
  wireless: "Yes",
  usb_connector: "Yes",
  memory_type: "Notebook DDR4 (SO-DIMM)",
  memory_size: "16 GB",
  chipseet_manufacturer: "AMD",
  resolution: "1920 x 1080 Full HD",
  wifi: "Wi-Fi 6/ax",
});
assert(eff.__derived_prikljucak === "Wireless (bežični)", "eff mouse");
assert(eff.__derived_keyboard_prikljucak === "Wireless", "eff keyboard");
assert(eff.__derived_ram_vrsta === "Laptop", "eff ram vrsta");
assert(eff.__derived_ram_quantity === "16 GB", "eff ram qty");
assert(eff.__derived_procesor === "AMD", "eff mb");
assert(eff.__derived_tv_resolution === "1080p (full HD)", "eff tv res");
assert(eff.__derived_ap_wifi_standard === "WiFi 6", "eff wifi std");
assert(eff.__derived_ap_band === "Dual band", "eff wifi band");

console.log("\nAll smoke checks passed.");
