// /i/:code Pages Function (R11-INVITE-01, API §8). Logic: src/lib/invite.ts.
import { renderInvite, type InviteEnv } from '../../src/lib/invite';
import { clientIp } from '../../src/lib/share';

export const onRequestGet = (ctx: { request: Request; params: { code: string }; env: InviteEnv }) =>
  renderInvite(String(ctx.params.code), ctx.env, ctx.request.url, clientIp(ctx.request.headers));
