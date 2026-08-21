export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  const { registerOlxNetGuard } = await import("./lib/olx/net-guard");
  registerOlxNetGuard();
}
