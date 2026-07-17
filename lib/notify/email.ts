export type NotifyInput = {
  subject: string;
  body: string;
};

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

export async function notifyAdmin(input: NotifyInput): Promise<void> {
  if (!RESEND_API_KEY || !ADMIN_EMAIL) {
    console.warn(
      "[notify] Preskočeno — RESEND_API_KEY ili ADMIN_NOTIFY_EMAIL nisu postavljeni.",
      input.subject,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [ADMIN_EMAIL],
      subject: input.subject,
      text: input.body,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[notify] Resend greška:", res.status, text.slice(0, 200));
  }
}

export async function notifyJobFailed(
  job: string,
  profileName: string | null,
  summary: string,
): Promise<void> {
  await notifyAdmin({
    subject: `[OLX Dashboard] Posao neuspješan: ${job}`,
    body: `Profil: ${profileName ?? "—"}\n\n${summary}`,
  });
}
