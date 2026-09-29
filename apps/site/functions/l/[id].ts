// /l/:id Pages Function (P13-WEB-06, API §8). Logic: src/lib/share.ts.
import { clientIp, renderListing, type ShareEnv } from '../../src/lib/share';

export const onRequestGet = (ctx: { request: Request; params: { id: string }; env: ShareEnv }) =>
  renderListing(String(ctx.params.id), ctx.env, ctx.request.url, clientIp(ctx.request.headers));
