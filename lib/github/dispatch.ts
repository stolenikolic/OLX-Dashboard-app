export type WorkflowName =
  | "sync-feed"
  | "post-listings"
  | "refresh-prices"
  | "sync-stock"
  | "delete-unmapped"
  | "sync-conversations"
  | "refresh-listings"
  | "sync-messages";

function githubRepoParts():
  | { ok: true; owner: string; repoName: string; token: string }
  | { ok: false; message: string } {
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

  return { ok: true, owner, repoName, token };
}

export async function dispatchGitHubWorkflow(
  workflow: WorkflowName,
  inputs?: Record<string, string>,
): Promise<{ ok: boolean; message: string }> {
  const repo = githubRepoParts();
  if (!repo.ok) return repo;

  const url = `https://api.github.com/repos/${repo.owner}/${repo.repoName}/actions/workflows/${workflow}.yml/dispatches`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${repo.token}`,
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

export async function cancelGitHubWorkflowRun(
  runId: number,
): Promise<{ ok: boolean; message: string }> {
  const repo = githubRepoParts();
  if (!repo.ok) return repo;

  const url = `https://api.github.com/repos/${repo.owner}/${repo.repoName}/actions/runs/${runId}/cancel`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${repo.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (res.status === 202 || res.status === 204) {
    return { ok: true, message: `GitHub run #${runId} otkazan.` };
  }

  const text = await res.text();
  return {
    ok: false,
    message: `GitHub cancel ${res.status}: ${text.slice(0, 300)}`,
  };
}

export function githubActionsRunUrl(runId: number): string | null {
  const repo = process.env.GITHUB_REPO;
  if (!repo) return null;
  return `https://github.com/${repo}/actions/runs/${runId}`;
}

export function githubActionsWorkflowUrl(workflow: WorkflowName): string | null {
  const repo = process.env.GITHUB_REPO;
  if (!repo) return null;
  return `https://github.com/${repo}/actions/workflows/${workflow}.yml`;
}
