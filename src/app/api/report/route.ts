import nodemailer from "nodemailer";

export const runtime = "nodejs";

type Report = { email: string; title: string; description: string; steps: string; website: string };
const recent = new Map<string, number[]>();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit + 1) : "";
}

function parseReport(value: unknown): Report | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const report = {
    email: clean(input.email, 254),
    title: clean(input.title, 100),
    description: clean(input.description, 4000),
    steps: clean(input.steps, 1500),
    website: clean(input.website, 100)
  };
  if (report.title.length < 5 || report.title.length > 100 || report.description.length < 20 || report.description.length > 4000 || report.steps.length > 1500 || (report.email && !emailPattern.test(report.email))) return null;
  return report;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "This request is not allowed." }, { status: 403 });
  const raw = await request.text();
  if (raw.length > 8000) return Response.json({ error: "The report is too long." }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return Response.json({ error: "Enter a valid report." }, { status: 400 }); }
  const report = parseReport(value);
  if (!report) return Response.json({ error: "Add a title of at least 5 characters and a description of at least 20 characters." }, { status: 400 });
  if (report.website) return Response.json({ ok: true }); // Quietly discard automated form submissions.

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM;
  const to = process.env.BUG_REPORT_TO;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !from || !to || !emailPattern.test(to)) {
    return Response.json({ error: "Email reporting is being set up. Please use GitHub Issues for now." }, { status: 503 });
  }

  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = `${address}:${report.email.toLowerCase()}`;
  const now = Date.now();
  const attempts = (recent.get(key) ?? []).filter(time => now - time < 60 * 60 * 1000);
  if (attempts.length >= 3) return Response.json({ error: "Please wait before sending another report." }, { status: 429 });
  recent.set(key, [...attempts, now]);
  if (recent.size > 1000) for (const [entry, times] of recent) if (times.every(time => now - time >= 60 * 60 * 1000)) recent.delete(entry);

  try {
    const transport = nodemailer.createTransport({ host, port, secure: port === 465, requireTLS: port !== 465,
      auth: { user, pass: password }, connectionTimeout: 7000, greetingTimeout: 7000, socketTimeout: 7000 });
    await transport.sendMail({
      from, to, ...(report.email ? { replyTo: report.email } : {}),
      subject: `[Nookplay bug] ${report.title.replace(/[\r\n]/g, " ")}`,
      text: `A new bug report was submitted from Nookplay.\n\nTitle: ${report.title}\nReply email: ${report.email || "Not provided"}\n\nDescription:\n${report.description}\n\nSteps to reproduce:\n${report.steps || "Not provided"}\n\nSubmitted: ${new Date(now).toISOString()}`
    });
    return Response.json({ ok: true });
  } catch {
    recent.set(key, attempts);
    return Response.json({ error: "The report could not be sent right now. Please try again or use GitHub Issues." }, { status: 502 });
  }
}
