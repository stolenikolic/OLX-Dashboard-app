/**
 * Smoke test for transformSpecValue / withDerivedSpecs (no DB).
 * Run: npx tsx scripts/smoke-transform-spec.ts
 */
import {
  deriveMbProcessor,
  deriveMouseConnector,
  deriveRamFormFactor,
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

console.log("derived");
assert(
  deriveMouseConnector({ wireless: "Yes", usb_connector: "Yes" }) ===
    "Wireless (bežični)",
  "mouse wireless",
);
assert(
  deriveMouseConnector({ wireless: "No", usb_connector: "Yes" }) === "USB",
  "mouse usb",
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
});
assert(eff.__derived_prikljucak === "Wireless (bežični)", "eff mouse");
assert(eff.__derived_ram_vrsta === "Laptop", "eff ram vrsta");
assert(eff.__derived_ram_quantity === "16 GB", "eff ram qty");
assert(eff.__derived_procesor === "AMD", "eff mb");

console.log("\nAll smoke checks passed.");
