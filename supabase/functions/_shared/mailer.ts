// Email templates and the send-email drain (P9-MAIL-01/02; API §5, ADR mail).
// No imports besides internal.ts and emailLayout.ts, so the Edge Function (Deno) and Node tests
// run the same code. Transport: Gmail SMTP (Plan A) or Resend (Plan B), both
// free; the function picks by MAIL_PROVIDER. Plain, short, no tracking pixels.
import { emailHtml } from './emailLayout.ts';
import { isServiceCaller, type InternalResponse } from './internal.ts';

export type Template =
  | 'campus_open'
  | 'account_paused'
  | 'reverify_due'
  | 'account_deleted'
  | 'data_export'
  | 'admin_reveal_receipt'
  | 'support_request'
  | 'priority_report'
  | 'support_reply'
  | 'report_queue'
  | 'photo_flag';

/** Where admin links and photos point (send-email reads ADMIN_URL and MEDIA_URL). */
export type MailUrls = { admin?: string; media?: string };

export const DEFAULT_ADMIN_URL = 'https://onlyswap-admin.pages.dev';

const REASON_WORDS: Record<string, string> = {
  weapon: 'a weapon',
  drugs: 'drugs',
  violence: 'violence or gore',
  hate: 'a hate symbol',
  sexual: 'sexual content',
  minor: 'a possible minor-safety problem',
  other: 'something against the rules',
};

const KIND_WORDS: Record<string, string> = {
  listing: 'Listing',
  quad: 'Quad post',
  avatar: 'Profile photo',
};

export type Rendered = { subject: string; text: string; html: string; replyTo?: string };

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const str = (v: unknown, fallback = '') =>
  typeof v === 'string' && v.trim() ? v.trim() : fallback;

/** Renders one outbox row. Unknown templates throw (the row fails after retries). */
export function render(
  template: Template,
  vars: Record<string, unknown>,
  site: string,
  urls: MailUrls = {},
): Rendered {
  const text = (lines: string[]) => [...lines, '', `OnlySwap · ${site}`].join('\n');
  const open = { label: 'Open OnlySwap', href: site.replace(/\/+$/, '') };
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
        html: emailHtml({
          site,
          preheader: `Thanks for waiting. Sign in with your school email and your spot is ready.`,
          hero: {
            title: `You're in. ${esc(campus)} is open.`,
            body: 'Thanks for waiting. Sign in with the same school email and your spot is ready.',
            button: open,
          },
          blocks: [
            {
              kind: 'steps',
              label: 'How it works',
              steps: [
                [
                  "Swipe what's for sale",
                  'Right to make an offer. Everyone here is a verified student.',
                ],
                ['Chat once they say yes', 'A chat opens when the seller accepts your offer.'],
                [
                  'Meet on campus, pay in person',
                  'Pick a Meetup spot and a time. Check the item before you pay.',
                ],
              ],
            },
          ],
          reason: `You joined the ${esc(campus)} waitlist, so we said we'd tell you. This is the only email about it.`,
        }),
      };
    }
    case 'account_paused': {
      const until = str(vars.until);
      const why = str(vars.reason);
      const lines = [
        `Your OnlySwap account is paused${until ? ` until ${until}` : ''}.`,
        'You can still read and finish your open chats. If you think this is wrong, open the app and send an appeal.',
      ];
      return {
        subject: 'Your OnlySwap account is paused',
        text: text(lines),
        html: emailHtml({
          site,
          preheader: 'You can still finish your open chats and planned meetups.',
          title: until ? `Your account is paused until ${esc(until)}` : 'Your account is paused',
          intro: `${why ? `${esc(why)} ` : ''}While it's paused you can't list or make offers.`,
          blocks: [
            {
              kind: 'checks',
              title: 'You can still',
              items: ['Read and reply in your open chats', 'Finish meetups you already planned'],
            },
            {
              kind: 'p',
              html: 'Think we got it wrong? Send an appeal from the app. A person on our team reads every one.',
            },
            { kind: 'button', button: { ...open, style: 'outline' } },
          ],
          reason: "We send account emails like this one even if you've turned off notifications.",
          links: [
            { label: 'Community rules', path: '/rules' },
            { label: 'Help', path: '/help' },
          ],
        }),
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
        html: emailHtml({
          site,
          preheader: 'It takes a minute: open the app and enter the code we send you.',
          hero: {
            title: "Quick check: you're still a student?",
            body: `Confirm${due ? ` by ${esc(due)}` : ''} to keep buying and selling. Open the app and enter the code we send to your school email.`,
            button: open,
          },
          blocks: [
            {
              kind: 'p',
              muted: true,
              html: 'We ask once a year so everyone on OnlySwap is a current student.',
            },
          ],
          reason: 'You have an OnlySwap account with this school email.',
        }),
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
        html: emailHtml({
          site,
          preheader: 'Your listings and profile are gone.',
          title: 'Your account is deleted',
          intro: 'Sorry to see you go. Here is what happened.',
          blocks: [
            {
              kind: 'rows',
              rows: [
                ['Profile and photo', 'Deleted'],
                ['Listings', 'Removed'],
                ['Chats', 'Show a deleted user'],
              ],
            },
            {
              kind: 'p',
              muted: true,
              html: "Didn't do this? Reply to this email and we'll look into it.",
            },
          ],
          reason: 'This is the last email we send to this address about your account.',
          links: [
            { label: 'Help', path: '/help' },
            { label: 'Privacy', path: '/privacy' },
          ],
        }),
      };
    }
    case 'data_export': {
      const url = str(vars.url);
      const lines = ['Your OnlySwap data export is ready.', `Download it within 7 days: ${url}`];
      return {
        subject: 'Your OnlySwap data export',
        text: text(lines),
        html: emailHtml({
          site,
          preheader: 'Download it within 7 days.',
          title: 'Your data is ready',
          intro: 'You asked for a copy of your OnlySwap data. Here it is.',
          blocks: [
            {
              kind: 'rows',
              rows: [
                ['File', 'onlyswap-data.zip'],
                ['Includes', 'Profile, listings, offers, chats'],
                ['Link works for', '7 days'],
              ],
            },
            {
              kind: 'button',
              button: { label: 'Download your data', href: esc(url), style: 'full' },
            },
            {
              kind: 'p',
              muted: true,
              html: "Didn't ask for this? Reply to this email and we'll help secure your account.",
            },
          ],
          reason: 'You got this because a data export was requested in Settings, Your data.',
          links: [
            { label: 'Help', path: '/help' },
            { label: 'Privacy', path: '/privacy' },
          ],
        }),
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
        html: emailHtml({
          site,
          preheader: 'We tell you every time this happens.',
          title: 'A safety review looked at your account',
          intro: `${esc(who)} viewed ${esc(what)} on your account as part of a safety review.`,
          blocks: [
            {
              kind: 'p',
              html: "We tell you every time this happens. You don't need to do anything.",
            },
            {
              kind: 'p',
              muted: true,
              html: 'Questions about it? Reply to this email.',
            },
          ],
          reason: "We send account emails like this one even if you've turned off notifications.",
          links: [
            { label: 'Privacy', path: '/privacy' },
            { label: 'Help', path: '/help' },
          ],
        }),
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
        html: emailHtml({
          site,
          preheader: `From ${esc(replyTo || 'someone')}`,
          title: `Support: ${esc(topic)}`,
          intro: `From ${esc(replyTo || 'someone')}. Reply to this email to answer them.`,
          blocks: [{ kind: 'quote', html: esc(body).replace(/\n/g, '<br>') }],
          reason: 'Sent to the OnlySwap support inbox.',
          links: [],
        }),
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
        html: emailHtml({
          site,
          preheader: `Filed on a ${esc(target)}. Review it now.`,
          title: `Priority report: ${esc(reason)}`,
          intro: `Filed on a ${esc(target)}. Open the admin console to review it now.`,
          reason: 'Sent to OnlySwap admins for priority reports.',
          links: [],
        }),
      };
    }
    case 'photo_flag': {
      // Red alert to the team: the automatic photo check flagged and held a post (DEC 154).
      const why = str(vars.reason, 'other');
      const words = REASON_WORDS[why] ?? REASON_WORDS.other!;
      const kind = KIND_WORDS[str(vars.kind)] ?? 'Post';
      const poster =
        str(vars.poster) ||
        (str(vars.kind) === 'quad' ? 'Anonymous (reveal in the console)' : 'Unknown');
      const what = str(vars.what);
      const campus = str(vars.campus);
      const posted = str(vars.posted_at);
      const flagged = str(vars.flagged_at);
      const admin = (urls.admin || DEFAULT_ADMIN_URL).replace(/\/+$/, '');
      const reportUrl = `${admin}/reports/${encodeURIComponent(str(vars.report_id))}`;
      const key = str(vars.photo_key);
      const photo =
        key && urls.media && why !== 'sexual' && why !== 'minor'
          ? `${urls.media.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`
          : '';
      const rows: [string, string][] = [
        ['Flagged for', esc(words)],
        ['What', esc(kind)],
        ...(what ? ([['Title', esc(what)]] as [string, string][]) : []),
        ['Posted by', esc(poster)],
        ...(campus ? ([['Campus', esc(campus)]] as [string, string][]) : []),
        ...(posted ? ([['Posted', esc(posted)]] as [string, string][]) : []),
        ...(flagged ? ([['Flagged', esc(flagged)]] as [string, string][]) : []),
      ];
      const lines = [
        `RED ALERT: a photo was flagged for ${words}.`,
        `${kind}${what ? `: ${what}` : ''}`,
        `Posted by ${poster}${campus ? ` at ${campus}` : ''}${posted ? `, ${posted}` : ''}.`,
        'It is already hidden from students. Review it now:',
        reportUrl,
      ];
      return {
        subject: `Red alert: ${kind.toLowerCase()} flagged for ${words}`,
        text: text(lines),
        html: emailHtml({
          site,
          preheader: `${kind}${what ? ` "${esc(what)}"` : ''} by ${esc(poster)}. Already hidden. Review it now.`,
          hero: {
            tone: 'red',
            eyebrow: 'Red alert',
            title: `A photo was flagged for ${esc(words)}`,
            body: "It's already hidden from students. Check it and decide what to do with the account.",
            button: { label: 'Review in the console', href: esc(reportUrl) },
          },
          blocks: [
            { kind: 'rows', rows },
            photo
              ? { kind: 'image', src: esc(photo), alt: 'The flagged photo', href: esc(reportUrl) }
              : {
                  kind: 'p',
                  muted: true,
                  html:
                    why === 'sexual' || why === 'minor'
                      ? "We don't put photos like this in email. Open the console to review it."
                      : 'Open the console to see the photo.',
                },
          ],
          reason: 'Sent to OnlySwap admins when the automatic photo check flags a post.',
          links: [],
        }),
      };
    }
    case 'support_reply': {
      // Free text from our team (admin_update_support), plain and escaped.
      const body = str(vars.body);
      const ref = str(vars.ref);
      const lines = [
        'Hi, this is OnlySwap support, answering your message' + (ref ? ` (ref ${ref})` : '') + '.',
        '',
        body,
        '',
        'You can reply to this email if you need anything else.',
      ];
      return {
        subject: 'Re: your OnlySwap support request',
        text: text(lines),
        html: emailHtml({
          site,
          preheader: 'OnlySwap support answered your message.',
          title: 'We answered your message',
          intro: `Hi, this is OnlySwap support${ref ? ` (ref ${esc(ref)})` : ''}.`,
          blocks: [
            { kind: 'quote', html: esc(body).replace(/\n/g, '<br>') },
            {
              kind: 'p',
              muted: true,
              html: 'You can reply to this email if you need anything else.',
            },
          ],
          reason: 'You got this because you contacted OnlySwap support.',
        }),
      };
    }
    case 'report_queue': {
      const count = Number(vars.open) || 0;
      const hours = Number(vars.oldest_hours) || 0;
      const lines = [
        `${count} open report${count === 1 ? '' : 's'}; the oldest has waited ${hours} hour${hours === 1 ? '' : 's'}.`,
        'Open the admin console to review the queue.',
      ];
      return {
        subject: 'Reports are waiting',
        text: text(lines),
        html: emailHtml({
          site,
          preheader: `${count} open, the oldest ${hours} h.`,
          title: 'Reports are waiting',
          blocks: [
            {
              kind: 'rows',
              rows: [
                ['Open reports', String(count)],
                ['Oldest waiting', `${hours} hour${hours === 1 ? '' : 's'}`],
              ],
            },
            { kind: 'p', muted: true, html: 'Open the admin console to review the queue.' },
          ],
          reason: 'Sent to OnlySwap admins when reports wait too long.',
          links: [],
        }),
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
  urls?: MailUrls;
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
      await deps.send(r.to, render(r.template, r.vars ?? {}, deps.site, deps.urls));
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
