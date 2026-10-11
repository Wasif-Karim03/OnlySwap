// Build-time environment of this console. VITE_APP_ENV is set only by the
// staging deploy (scripts/deploy/cloudflare-staging.command); any other build,
// production included, is not staging and never shows the staging tools.
import { isStagingBuild } from './nav';

export const STAGING: boolean = isStagingBuild(import.meta.env.VITE_APP_ENV);
