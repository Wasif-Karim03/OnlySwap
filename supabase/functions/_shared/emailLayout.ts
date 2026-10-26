// OnlySwap email layout (owner-picked design, 2026-10-26: "Pistachio on a
// phone"). Email-safe HTML only: tables, inline styles, a hosted PNG logo
// (Gmail drops SVG), no flexbox, no web fonts, no images the reader needs.
// Every string a template passes in is already escaped HTML.

export const INK = '#111110';
export const INK2 = '#5A5A54';
export const INK3 = '#8A8A84';
export const LINE = '#ECECE8';
export const BG2 = '#F3F3F0';
export const PISTACHIO = '#C8E27D';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MONO = "'SF Mono',ui-monospace,Menlo,Consolas,monospace";

export type Button = { label: string; href: string; style?: 'solid' | 'outline' | 'full' };

export type Block =
  | { kind: 'p'; html: string; muted?: boolean }
  | { kind: 'button'; button: Button }
  | { kind: 'rows'; rows: [label: string, value: string][] }
  | { kind: 'steps'; label: string; steps: [title: string, body: string][] }
  | { kind: 'checks'; title: string; items: string[] }
  | { kind: 'quote'; html: string };

export type Hero = {
  title: string;
  body?: string;
  /** A one-time code, shown big on a white card. */
  code?: string;
  codeNote?: string;
  button?: Button;
};

export type Layout = {
  site: string;
  /** Inbox preview text (hidden in the body). */
  preheader: string;
  /** Pistachio block for good news and codes; omit for notices. */
  hero?: Hero;
  /** Plain header when there is no hero. */
  title?: string;
  intro?: string;
  blocks?: Block[];
  /** Why they got it, one line. */
  reason: string;
  links?: { label: string; path: string }[];
};

const DEFAULT_LINKS = [
  { label: 'Help', path: '/help' },
  { label: 'Privacy', path: '/privacy' },
  { label: 'Safety', path: '/safety' },
];

const trimSite = (site: string) => site.replace(/\/+$/, '');

export function logoUrl(site: string): string {
  return `${trimSite(site)}/email/logo.png`;
}

function wordmark(site: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="vertical-align:middle;padding-right:7px"><img src="${logoUrl(site)}" width="18" height="18" alt="" style="display:block;border:0"></td>` +
    `<td style="vertical-align:middle;font-family:${FONT};font-size:15px;font-weight:700;letter-spacing:-0.2px;color:${INK}">onlyswap</td>` +
    `</tr></table>`
  );
}

export function buttonHtml(b: Button): string {
  const style = b.style ?? 'solid';
  const full = style === 'full';
  const outline = style === 'outline';
  const bg = outline ? '#FFFFFF' : INK;
  const fg = outline ? INK : '#FFFFFF';
  const border = outline ? `border:1.5px solid ${INK};` : '';
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${full ? ' width="100%"' : ''}><tr>` +
    `<td align="center" bgcolor="${bg}" style="border-radius:12px;${border}">` +
    `<a href="${b.href}" style="display:block;padding:${outline ? '13px 20px' : '14px 22px'};font-family:${FONT};font-size:16px;font-weight:600;line-height:20px;color:${fg};text-decoration:none;border-radius:12px">${b.label}</a>` +
    `</td></tr></table>`
  );
}

function heroHtml(h: Hero, site: string): string {
  const parts: string[] = [
    wordmark(site),
    `<div style="height:20px;line-height:20px">&nbsp;</div>`,
    `<div style="font-family:${FONT};font-size:26px;line-height:30px;font-weight:700;letter-spacing:-0.4px;color:${INK}">${h.title}</div>`,
  ];
  if (h.body) {
    parts.push(
      `<div style="height:12px;line-height:12px">&nbsp;</div>`,
      `<div style="font-family:${FONT};font-size:16px;line-height:23px;color:${INK}">${h.body}</div>`,
    );
  }
  if (h.code) {
    parts.push(
      `<div style="height:20px;line-height:20px">&nbsp;</div>`,
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td align="center" bgcolor="#FFFFFF" style="border-radius:16px;padding:18px 8px 16px">` +
        `<div style="font-family:${MONO};font-size:40px;line-height:44px;font-weight:700;letter-spacing:7px;color:${INK}">${h.code}</div>` +
        (h.codeNote
          ? `<div style="padding-top:6px;font-family:${FONT};font-size:13px;line-height:18px;color:${INK2}">${h.codeNote}</div>`
          : '') +
        `</td></tr></table>`,
    );
  }
  if (h.button) {
    parts.push(`<div style="height:18px;line-height:18px">&nbsp;</div>`, buttonHtml(h.button));
  }
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td bgcolor="${PISTACHIO}" style="border-radius:22px;padding:22px 22px 24px">${parts.join('')}</td>` +
    `</tr></table>`
  );
}

function blockHtml(b: Block): string {
  switch (b.kind) {
    case 'p':
      return `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:24px;color:${b.muted ? INK2 : INK}">${b.html}</p>`;
    case 'button':
      return `<div style="padding:6px 0 16px">${buttonHtml(b.button)}</div>`;
    case 'quote':
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr>` +
        `<td bgcolor="${BG2}" style="border-radius:16px;padding:16px 18px;font-family:${FONT};font-size:16px;line-height:24px;color:${INK}">${b.html}</td>` +
        `</tr></table>`
      );
    case 'rows':
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border:1px solid ${LINE};border-radius:16px;border-collapse:separate">` +
        b.rows
          .map(
            ([label, value], i) =>
              `<tr><td style="padding:14px 16px;white-space:nowrap;font-family:${FONT};font-size:15px;line-height:20px;color:${INK2};${i > 0 ? `border-top:1px solid ${LINE};` : ''}">${label}</td>` +
              `<td align="right" style="padding:14px 16px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${INK};${i > 0 ? `border-top:1px solid ${LINE};` : ''}">${value}</td></tr>`,
          )
          .join('') +
        `</table>`
      );
    case 'steps':
      return (
        `<div style="padding:8px 0 6px;font-family:${FONT};font-size:13px;line-height:18px;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:${INK3}">${b.label}</div>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px">` +
        b.steps
          .map(
            ([title, body], i) =>
              `<tr><td width="38" valign="top" style="padding:10px 0 6px">` +
              `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" width="26" height="26" bgcolor="${BG2}" style="border-radius:13px;font-family:${FONT};font-size:13px;font-weight:700;color:${INK}">${i + 1}</td></tr></table></td>` +
              `<td valign="top" style="padding:10px 0 6px;font-family:${FONT}"><div style="font-size:16px;line-height:22px;font-weight:600;color:${INK}">${title}</div>` +
              `<div style="font-size:15px;line-height:21px;color:${INK2}">${body}</div></td></tr>`,
          )
          .join('') +
        `</table>`
      );
    case 'checks':
      return (
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px"><tr>` +
        `<td bgcolor="${BG2}" style="border-radius:16px;padding:16px 18px">` +
        `<div style="font-family:${FONT};font-size:15px;line-height:20px;font-weight:600;color:${INK};padding-bottom:4px">${b.title}</div>` +
        b.items
          .map(
            (item) =>
              `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
              `<td valign="top" style="padding:6px 10px 0 0;font-family:${FONT};font-size:15px;line-height:21px;font-weight:700;color:#12703F">&#10003;</td>` +
              `<td valign="top" style="padding-top:6px;font-family:${FONT};font-size:15px;line-height:21px;color:${INK}">${item}</td></tr></table>`,
          )
          .join('') +
        `</td></tr></table>`
      );
  }
}

/** The whole email document. */
export function emailHtml(l: Layout): string {
  const site = trimSite(l.site);
  const links = (l.links ?? DEFAULT_LINKS)
    .map(
      (x) =>
        `<a href="${site}${x.path}" style="color:${INK2};text-decoration:underline">${x.label}</a>`,
    )
    .join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  const top = l.hero
    ? heroHtml(l.hero, site)
    : wordmark(site) +
      `<div style="height:24px;line-height:24px">&nbsp;</div>` +
      (l.title
        ? `<div style="font-family:${FONT};font-size:26px;line-height:30px;font-weight:700;letter-spacing:-0.4px;color:${INK}">${l.title}</div>`
        : '') +
      (l.intro
        ? `<div style="height:10px;line-height:10px">&nbsp;</div><div style="font-family:${FONT};font-size:16px;line-height:24px;color:${INK2}">${l.intro}</div>`
        : '');
  const blocks = (l.blocks ?? []).map(blockHtml).join('');
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">' +
    '<title>OnlySwap</title></head>' +
    `<body style="margin:0;padding:0;background:#FFFFFF;-webkit-text-size-adjust:100%">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${l.preheader}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#FFFFFF"><tr><td align="center" style="padding:16px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">` +
    `<tr><td style="padding:${l.hero ? '0' : '10px 6px 0'}">${top}</td></tr>` +
    `<tr><td style="padding:${l.hero ? '24px 6px 0' : '22px 6px 0'}">${blocks}</td></tr>` +
    `<tr><td style="padding:12px 6px 8px"><div style="border-top:1px solid ${LINE};height:1px;line-height:1px">&nbsp;</div>` +
    `<p style="margin:16px 0 8px;font-family:${FONT};font-size:13px;line-height:19px;color:${INK3}">${l.reason}</p>` +
    (links
      ? `<p style="margin:0;font-family:${FONT};font-size:13px;line-height:19px;color:${INK3}">${links}</p>`
      : '') +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}
