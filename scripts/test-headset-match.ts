/**
 * Run: npx tsx scripts/test-headset-match.ts
 */
import { OLX_CAT } from "@/lib/pricing/competitor/normalize-title";
import { matchesRule } from "@/lib/pricing/competitor/match-rules";

const CAT = OLX_CAT.headset;
const OUR = "STEELSERIES Arctis Nova 5 black";

const cases: Array<{ ad: string; expect: boolean; note: string }> = [
  {
    ad: "STEELSERIES Arctis Nova Pro Wireless Playstation black",
    expect: false,
    note: "actual bad match (Nova Pro Wireless)",
  },
  {
    ad: "STEELSERIES Arctis Nova Pro Wireless Playstation black V2",
    expect: false,
    note: "SrkiTech 610 KM",
  },
  { ad: "STEELSERIES Arctis Nova 5 black", expect: true, note: "exact" },
  {
    ad: "STEELSERIES Arctis Nova 5 Wireless black",
    expect: false,
    note: "wireless variant",
  },
  { ad: "STEELSERIES Arctis Nova 7P Wireless bl", expect: false, note: "Nova 7P" },
  { ad: "STEELSERIES Arctis Nova 1 wh", expect: false, note: "Nova 1" },
  {
    ad: "STEELSERIES Arctis Nova Pro Playstation bl",
    expect: false,
    note: "Nova Pro wired",
  },
];

let failed = 0;
for (const c of cases) {
  const got = matchesRule(CAT, OUR, c.ad);
  const ok = got === c.expect;
  if (!ok) failed++;
  console.log(`${ok ? "OK" : "FAIL"} ${c.note}: ${got} (expected ${c.expect})`);
  console.log(`     ad: ${c.ad}`);
}

if (failed > 0) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nAll headset match tests passed.");
