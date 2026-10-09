# OnlySwap website (`apps/site`)

The public website at **https://onlyswap.pages.dev**. It's an Astro site with a few Cloudflare Pages Functions. The design is the approved mock in [`design/website-mock.html`](../../design/website-mock.html); the reasoning behind it is DEC 87 in [`docs/DECISIONS_LOG.md`](../../docs/DECISIONS_LOG.md).

## Folder map

```
apps/site
├── src/
│   ├── pages/            One file per URL
│   │   ├── index.astro       /            the landing page (hero, listings, how it works, features, safety, school check)
│   │   ├── help.astro        /help        FAQ + contact form
│   │   ├── delete.astro      /delete      delete your account (email code)
│   │   ├── joined.astro      /joined      after joining the waitlist
│   │   ├── [legal].astro     /terms /privacy /rules /safety /cookies /banned-items /child-safety
│   │   ├── 404.astro         not found
│   │   ├── robots.txt.ts, sitemap.xml.ts
│   ├── layouts/Base.astro    header, footer, page shell (every page uses it)
│   ├── components/
│   │   ├── Sprite.astro      logo + icon set (one SVG sprite)
│   │   └── Turnstile.astro   Cloudflare bot check (invisible unless needed)
│   ├── scripts/landing.ts    landing page animations + the real school check
│   ├── styles/site.css       all styles (colors at the top, then section by section)
│   ├── lib/                  talks to Supabase: client.ts (waitlist, schools, support, delete),
│   │                         share.ts (/l listing cards), invite.ts (/i invites)
│   └── content/legal/*.md    policy text (edit these to change Terms, Privacy, etc.)
├── public/               served as-is
│   ├── img/app/          app screens shown on the landing page (from the design board)
│   ├── img/items/        example item photos (public domain; replace with your own)
│   ├── img/og.png        link preview image
│   ├── favicon.svg, _headers (security headers), _redirects, .well-known/ (app links)
├── functions/            Cloudflare Pages Functions: /l/:id listing share, /m/:token meetup share, /i/:code invite
├── scripts/              build helpers (well-known files, tokens copy)
└── test/                 node tests for lib/ and well-known
```

## Common edits

| I want to change… | Edit |
|---|---|
| Headline, text or sections on the home page | `src/pages/index.astro` |
| The rotating word (dorm, class, club…) | `index.astro`, the `#rot` spans |
| What the hero phone shows and its notification text | `index.astro` (`#heroScreen` images) and `NOTES` in `src/scripts/landing.ts` |
| Example listings in the moving rows | `items` at the top of `index.astro` + photos in `public/img/items` |
| Colors | the `:root` block at the top of `src/styles/site.css` |
| Header or footer links | `src/layouts/Base.astro` |
| Terms, Privacy and other policies | `src/content/legal/*.md` |
| Help questions | the `faq` list in `src/pages/help.astro` |

## Run and deploy

```bash
pnpm i                              # once, from the repo root
pnpm --filter site dev              # local preview at http://localhost:4321
pnpm --filter site test             # tests
bash scripts/deploy/site.command    # build with the staging values and publish to onlyswap.pages.dev
```

Build-time settings (all public): `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_TURNSTILE_SITE_KEY`, `PUBLIC_WEB_APP_URL`, `PUBLIC_APP_STORE_URL`, `PUBLIC_PLAY_STORE_URL`, `SITE_URL`, `APPLE_TEAM_ID`, `ANDROID_SHA256`. `site.command` fills them from `.env.staging`.

Rules from `CLAUDE.md` apply here too: no em dashes or emoji in copy, "Meetup spot" wording, and no secrets in this folder.
