import { OlxClient } from "@/lib/olx/client";

/**
 * Live exploration helper for the OLX API.
 *
 * Usage:
 *   npm run olx:explore                 -> login + top categories + sample finds
 *   npm run olx:explore -- "Felge"      -> also findCategory("Felge")
 *   npm run olx:explore -- attrs 123    -> dump attributes for category id 123
 */
async function main() {
  const username = process.env.OLX_USERNAME;
  const password = process.env.OLX_PASSWORD;
  const deviceName = process.env.OLX_DEVICE_NAME ?? "api_integration";

  if (!username || !password) {
    throw new Error("OLX_USERNAME / OLX_PASSWORD nisu postavljeni u okruženju.");
  }

  const client = new OlxClient({ deviceName });
  const login = await client.login(username, password);
  console.log(
    `Prijavljen: id=${login.user.id} type=${login.user.type} username=${login.user.username}`,
  );

  const args = process.argv.slice(2);

  if (args[0] === "children" && args[1]) {
    const id = Number(args[1]);
    const children = await client.getChildren(id);
    console.log(`\nPodkategorije od ${id} (${children.length}):`);
    for (const c of children) {
      console.log(
        `  #${c.id} ${c.name} (${c.slug}) parent=${c.parent_id} has_models=${c.has_models}`,
      );
    }
    return;
  }

  if (args[0] === "attrs" && args[1]) {
    const id = Number(args[1]);
    const attrs = await client.getCategoryAttributes(id);
    console.log(`\nAtributi za kategoriju ${id} (${attrs.length}):`);
    for (const a of attrs) {
      console.log(
        `  #${a.id} ${a.name} [${a.input_type}] required=${a.required} display="${a.display_name}" options=${JSON.stringify(a.options ?? [])}`,
      );
    }
    return;
  }

  const top = await client.getCategories();
  console.log(`\nTop kategorije (${top.length}):`);
  for (const c of top) {
    console.log(`  #${c.id} ${c.name} (${c.slug}) has_models=${c.has_models}`);
  }

  const names = [
    ...args,
    "Vazdušna hlađenja",
    "Grafičke karte",
    "Procesori",
    "Kućišta",
  ];

  for (const name of names) {
    try {
      const found = await client.findCategory(name);
      console.log(`\nfindCategory("${name}") -> ${found.length}:`);
      for (const f of found) {
        console.log(`  #${f.id}  ${f.path}`);
      }
    } catch (e) {
      console.log(`findCategory("${name}") greška: ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
