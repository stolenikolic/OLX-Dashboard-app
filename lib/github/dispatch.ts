export type WorkflowName =
  | "sync-feed"
  | "post-listings"
  | "refresh-prices"
  | "sync-stock";

export async function dispatchGitHubWorkflow(
  workflow: WorkflowName,
  inputs?: Record<string, string>,
): Promise<{ ok: boolean; message: string }> {
  const token = process.env.GH_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO;

  if (!token || !repo) {
    return {
      ok: false,
      message: "GH_DISPATCH_TOKEN ili GITHUB_REPO nisu postavljeni.",
    };
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    return { ok: false, message: "GITHUB_REPO mora biti owner/repo." };
  }

  const url = `https://api.github.com/repos/${owner}/${repoName}/actions/workflows/${workflow}.yml/dispatches`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: process.env.GITHUB_REF ?? "main",
      inputs: inputs ?? {},
    }),
  });

  if (res.status === 204) {
    return { ok: true, message: `Workflow ${workflow} pokrenut.` };
  }

  const text = await res.text();
  return {
    ok: false,
    message: `GitHub API ${res.status}: ${text.slice(0, 300)}`,
  };
}
