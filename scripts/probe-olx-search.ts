async function main() {
  const base = "https://olx.ba/api/search";
  const tests = [
    "attr=&attr_encoded=1&page=1&sort_by=date&sort_order=desc&user_id=261905&per_page=1000",
    "attr=&attr_encoded=1&page=1&sort_by=date&sort_order=asc&user_id=261905&per_page=1000",
    "attr=&attr_encoded=1&page=10&sort_by=date&sort_order=desc&user_id=261905&per_page=1000",
    "attr=&attr_encoded=1&page=11&sort_by=date&sort_order=desc&user_id=261905&per_page=1000",
  ];

  for (const q of tests) {
    const res = await fetch(`${base}?${q}`, {
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      console.log({ q: q.slice(0, 60), status: res.status, body: text.slice(0, 200) });
      continue;
    }

    const data = json.data;
    const arr = Array.isArray(data) ? data : [];
    const first = arr[0] as { id?: number; title?: string } | undefined;
    const last = arr[arr.length - 1] as { id?: number } | undefined;

    console.log(
      JSON.stringify({
        pageQuery: q.includes("page=11")
          ? "page=11 desc"
          : q.includes("page=10")
            ? "page=10 desc"
            : q.includes("asc")
              ? "page=1 asc"
              : "page=1 desc",
        status: res.status,
        keys: Object.keys(json),
        meta: json.meta ?? null,
        n: arr.length,
        firstId: first?.id,
        lastId: last?.id,
        title: first?.title?.slice(0, 40),
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
