// sitemap.xml (P13-WEB-09): the public pages only. Share pages (/l, /m) and
// /delete stay out of search.
import type { APIRoute } from 'astro';

const legal = Object.keys(import.meta.glob('../content/legal/*.md')).map(
  (p) => '/' + p.split('/').pop()!.replace(/\.md$/, ''),
);
const paths = ['/', '/help', ...legal];

export const GET: APIRoute = ({ site }) => {
  const urls = paths
    .map((p) => `  <url><loc>${new URL(p, site).toString()}</loc></url>`)
    .join('\n');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'content-type': 'application/xml' } },
  );
};
