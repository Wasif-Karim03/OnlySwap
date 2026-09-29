// robots.txt (P13-WEB-09), built with the site URL so the sitemap link is right.
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) =>
  new Response(
    `User-agent: *\nAllow: /\nDisallow: /l/\nDisallow: /m/\nDisallow: /delete\n\nSitemap: ${new URL('/sitemap.xml', site).toString()}\n`,
    { headers: { 'content-type': 'text/plain' } },
  );
