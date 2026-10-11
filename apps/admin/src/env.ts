// Build-time environment of this console. VITE_APP_ENV is set only by the
// staging deploy (scripts/deploy/cloudflare-staging.command); any other build,
// production included, is not staging and never shows the staging tools.
// Written as a plain comparison so Vite inlines it and a production build
// drops the staging-only code (Settings > Staging tools) entirely.
export const STAGING: boolean = import.meta.env.VITE_APP_ENV === 'staging';
