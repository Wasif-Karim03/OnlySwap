// /m/:token Pages Function (P13-WEB-06, API §8). Logic: src/lib/share.ts.
import { clientIp, renderMeetup, type ShareEnv } from '../../src/lib/share';

export const onRequestGet = (ctx: { request: Request; params: { token: string }; env: ShareEnv }) =>
  renderMeetup(String(ctx.params.token), ctx.env, ctx.request.url, clientIp(ctx.request.headers));
