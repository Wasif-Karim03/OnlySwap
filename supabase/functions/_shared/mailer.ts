// Email templates and the send-email drain (P9-MAIL-01/02; API §5, ADR mail).
// No imports besides internal.ts, so the Edge Function (Deno) and Node tests
// run the same code. Transport: Gmail SMTP (Plan A) or Resend (Plan B), both
// free; the function picks by MAIL_PROVIDER. Plain, short, no tracking pixels.
import { isServiceCaller, type InternalResponse } from './internal.ts';

export type Template =
  | 'campus_open'
  | 'account_paused'
  | 'reverify_due'
  | 'account_deleted'
  | 'data_export'
  | 'admin_reveal_receipt'
  | 'support_request'
  | 'priority_report';

export type Rendered = { subject: string; text: string; html: string; replyTo?: string };

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const str = (v: unknown, fallback = '') =>
  typeof v === 'string' && v.trim() ? v.trim() : fallback;

function page(paragraphs: string[], site: string): string {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px">${p}</p>`).join('');
  return (
    '<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#111110;max-width:520px;margin:0 auto;padding:24px">' +
    body +
    `<p style="margin:24px 0 0;font-size:13px;color:#5A5A54">OnlySwap · <a href="${esc(site)}" style="color:#5A5A54">${esc(
      site.replace(/^https?:\/\//, ''),
    )}</a></p></body></html>`
  );
}

/** Renders one outbox row. Unknown templates throw (the row fails after retries). */
export function render(template: Template, vars: Record<string, unknown>, site: string): Rendered {
  const text = (lines: string[]) => [...lines, '', `OnlySwap · ${site}`].join('\n');
  switch (template) {
    case 'campus_open': {
      const campus = str(vars.campus, 'your campus');
      const lines = [
        `OnlySwap is open at ${campus}.`,
        'Download the app and sign in with the same school email to start swapping.',
      ];
      return {
        subject: `OnlySwap is open at ${campus}`,
        text: text(lines),
        html: page(lines.map(esc), site),
      };
    }
    case 'account_paused': {
      const until = str(vars.until);
      const lines = [
        `Your OnlySwap account is paused${until ? ` until ${until}` : ''}.`,
        'You can still read and finish your open chats. If you think this is wrong, open the app and send an appeal.',
      ];
      return {
        subject: 'Your OnlySwap account is paused',
        text: text(lines),
        html: page(lines.map(esc), site),
      };
    }
    case 'reverify_due': {
      const due = str(vars.due);
      const lines = [
        `Please confirm you're still a student${due ? ` by ${due}` : ''}.`,
        'Open OnlySwap and enter the code we send to your school email. It takes a minute.',
      ];
      return {
        subject: "Confirm you're still a student",
        text: text(lines),
        html: page(lines.map(esc), site),
      };
    }
    case 'account_deleted': {
      const lines = [
        'Your OnlySwap account is deleted.',
        "Your listings and profile are gone. People you chatted with see a deleted user. If you didn't do this, reply to this email.",
      ];
      return {
        subject: 'Your OnlySwap account is deleted',
        text: text(lines),
        html: page(lines.map(esc), site),
      };
    }
    case 'data_export': {
      const url = str(vars.url);
      const lines = ['Your OnlySwap data export is ready.', `Download it within 7 days: ${url}`];
      return {
        subject: 'Your OnlySwap data export',
        text: text(lines),
        html: page(
          [esc(lines[0]), `Download it within 7 days: <a href="${esc(url)}">${esc(url)}</a>`],
          site,
        ),
      };
    }
    case 'admin_reveal_receipt': {
      const who = str(vars.admin, 'An admin');
      const what = str(vars.what, 'account details');
      const lines = [
        `${who} viewed ${what} on your OnlySwap account for a safety review.`,
        'We tell you every time this happens.',
      ];
      return {
        subject: 'A safety review looked at your account',
        text: text(lines),
        html: page(lines.map(esc), site),
      };
    }
    case 'support_request': {
      const topic = str(vars.topic, 'general');
      const body = str(vars.body);
      const replyTo = str(vars.reply_to);
      const lines = [`Support request (${topic}) from ${replyTo || 'someone'}:`, '', body];
      return {
        subject: `Support: ${topic}`,
        text: text(lines),
        html: page([esc(lines[0]), esc(body).replace(/\n/g, '<br>')], site),
        replyTo: replyTo || undefined,
      };
    }
    case 'priority_report': {
      const reason = str(vars.reason, 'report');
      const target = str(vars.target_type, 'item');
      const lines = [
        `A priority report (${reason}) was filed on a ${target}.`,
        'Open the admin console to review it now.',
      ];
      return {
        subject: `Priority report: ${reason}`,
        text: text(lines),
        html: page(lines.map(esc), site),
      };
    }
    default:
      throw new Error(`unknown template ${String(template)}`);
  }
}

export type OutboxRow = {
  id: number;
  to: string;
  template: Template;
  vars: Record<string, unknown>;
};

export type SendEmailDeps = {
  keys: (string | undefined)[];
  site: string;
  claim: (limit: number) => Promise<OutboxRow[]>;
  finish: (results: { id: number; ok: boolean; error?: string }[]) => Promise<void>;
  send: (to: string, mail: Rendered) => Promise<void>;
  log?: (event: string, counts: Record<string, number>) => void;
};

export async function handleSendEmail(
  req: { method: string; authorization: string | null },
  deps: SendEmailDeps,
  limit = 50,
): Promise<InternalResponse> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'METHOD_NOT_ALLOWED' } };
  if (!isServiceCaller(req.authorization, deps.keys))
    return { status: 401, body: { error: 'NOT_AUTHENTICATED' } };
  const rows = await deps.claim(limit);
  const results: { id: number; ok: boolean; error?: string }[] = [];
  for (const r of rows) {
    try {
      await deps.send(r.to, render(r.template, r.vars ?? {}, deps.site));
      results.push({ id: r.id, ok: true });
    } catch (e) {
      results.push({
        id: r.id,
        ok: false,
        error: e instanceof Error ? e.message.slice(0, 200) : 'error',
      });
    }
  }
  await deps.finish(results);
  const sent = results.filter((r) => r.ok).length;
  deps.log?.('send-email', { claimed: rows.length, sent, failed: rows.length - sent });
  return { status: 200, body: { ok: true, claimed: rows.length, sent } };
}

/** Plan B transport: Resend's REST API (free tier). */
export function resendSender(apiKey: string, from: string, doFetch: typeof fetch = fetch) {
  return async (to: string, mail: Rendered) => {
    const res = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
    });
    if (!res.ok) throw new Error(`resend ${res.status}`);
  };
}
