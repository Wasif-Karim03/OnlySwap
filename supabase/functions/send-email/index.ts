// send-email Edge Function (P9-MAIL-02; API §5, ADR-016). Internal: the
// `email_drain` cron calls it every 5 minutes when the outbox has mail due.
//   {} → { ok, claimed, sent }
// Transport by EMAIL_PROVIDER: `gmail` (SMTP 465, app password in GMAIL_APP_PASSWORD)
// or `resend` (RESEND_API_KEY). The 400/day cap is in private.claim_emails.
import nodemailer from 'npm:nodemailer@6.9.16';
import postgres from 'npm:postgres@3.4.7';

import { handleSendEmail, resendSender, type OutboxRow, type Rendered } from '../_shared/mailer.ts';
import { withMonitoring } from '../_shared/monitor.ts';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false });
const keys = [Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('INTERNAL_FUNCTION_KEY')];
const site = Deno.env.get('SITE_URL') ?? 'https://onlyswap.pages.dev';
const provider = Deno.env.get('EMAIL_PROVIDER') ?? 'gmail';
const from = Deno.env.get('EMAIL_FROM') ?? '';

function gmailSender() {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: Deno.env.get('GMAIL_USER') ?? '',
      pass: Deno.env.get('GMAIL_APP_PASSWORD') ?? '',
    },
  });
  return async (to: string, mail: Rendered) => {
    await transport.sendMail({
      from: from || Deno.env.get('GMAIL_USER'),
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    });
  };
}

const send =
  provider === 'resend' ? resendSender(Deno.env.get('RESEND_API_KEY') ?? '', from) : gmailSender();

Deno.serve(
  withMonitoring(
    'send-email',
    async (req) => {
      const res = await handleSendEmail(
        { method: req.method, authorization: req.headers.get('authorization') },
        {
          keys,
          site,
          claim: async (limit) => {
            const rows = await sql`select private.claim_emails(${limit}) as j`;
            return (rows[0]?.j ?? []) as OutboxRow[];
          },
          finish: async (results) => {
            await sql`select private.finish_emails(${sql.json(results)}::jsonb)`;
          },
          send,
          // Counts only; no addresses in logs (SECURITY §6).
          log: (event, counts) => console.log(JSON.stringify({ event, ...counts })),
        },
      );
      return new Response(JSON.stringify(res.body), {
        status: res.status,
        headers: { 'content-type': 'application/json' },
      });
    },
    Deno.env,
  ),
);
