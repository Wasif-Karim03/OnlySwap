# CLAUDE.md — working agreement for Claude Code

- **Source of truth:**
  - `docs/blueprint/*` (screens, backend, functions, tasks, testing, launch)
  - `docs/OnlySwap-Build-Plan.md` (stack and limits)
  - `design/OS_FInal Design.html` (visual spec)
- **Work by task ID** from `docs/blueprint/tasks.md`. Only do the tasks you're asked for. When a task's "done when" check passes, tick its box.
- **Don't change the stack or add paid services.** Everything must stay on the free tiers in the build plan (only the Apple fee and Google's $25 fee are allowed). If something would cost money, stop and ask.
- **Server logic** goes in SQL migrations (`supabase/migrations`) as `security definer` RPCs, with RLS on every table. Never put the service key in the app.
- **Copy** lives only in `apps/mobile/src/strings/en.ts`. Follow the Voice guide (design H4): plain student voice, no em dashes, no emoji in UI.
- **Styling** uses tokens from `packages/tokens` only, never raw hex values.
- **Tests:** every RPC and policy gets a pgTAP test; every lib function gets a Jest test. Run `pnpm test` and `supabase test db` before finishing.
- **Compliance** (build plan §19): 18+ with the age check, no anonymous chat, promotional push is opt-in, no university names or marks in store assets, and EXIF is stripped from photos.
