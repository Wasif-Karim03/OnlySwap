import type { Session } from '@supabase/supabase-js';

import { toAppError } from '@/lib/errors';
import { createRpc, type RpcClient } from '@/lib/rpc';
import { getSupabase } from '@/lib/supabase';

import {
  emailDomain,
  isPersonalDomain,
  normalizeEmail,
  parseAppConfig,
  type AppConfig,
  type GateProfile,
} from './logic';

/**
 * Auth calls (P4-AUTH-02). Built from injected clients so tests run without a
 * network; `authApi` below is the app's instance.
 */

type AuthResult = { data: { session: Session | null } | null; error: unknown };

export type AuthClient = {
  signInWithOtp: (args: {
    email: string;
    options?: { shouldCreateUser?: boolean; data?: Record<string, string> };
  }) => PromiseLike<{ error: unknown }>;
  verifyOtp: (args: { email: string; token: string; type: 'email' }) => PromiseLike<AuthResult>;
  signInWithPassword: (args: { email: string; password: string }) => PromiseLike<AuthResult>;
  signOut: (args?: { scope?: 'local' | 'global' | 'others' }) => PromiseLike<{ error: unknown }>;
};

type ProfileRow = {
  status: GateProfile['status'];
  first_name: string | null;
  adult_confirmed_at: string | null;
  rules_version: string | null;
};

export type ProfileQuery = (
  userId: string,
) => PromiseLike<{ data: ProfileRow | null; error: unknown }>;

export type School = {
  campusId: string;
  name: string;
  shortName: string;
  status: 'waitlist' | 'live' | 'paused';
  isReview: boolean;
};

export type SchoolLookup =
  | { kind: 'invalid' }
  | { kind: 'personal' }
  | { kind: 'unknown' }
  | { kind: 'school'; school: School };

/** Edge Function caller (supabase.functions.invoke adds the user's JWT). */
export type FunctionsClient = {
  invoke: (
    name: string,
    options: { body: Record<string, unknown> },
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

type Deps = {
  auth: () => AuthClient;
  rpc: () => RpcClient;
  profile: ProfileQuery;
  functions?: () => FunctionsClient;
};

/**
 * GoTrue answers 429 when codes are requested too often; the app shows the
 * same "slow down" copy as a server RATE_LIMITED.
 */
function authError(error: unknown) {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 429) return toAppError({ code: 'P0001', message: 'RATE_LIMITED:otp' });
  return toAppError(error);
}

export function createAuthApi(deps: Deps) {
  const rpc = createRpc(deps.rpc);

  function requireEmail(input: string): string {
    const email = normalizeEmail(input);
    if (!email) throw toAppError({ code: 'P0001', message: 'INVALID:email' });
    return email;
  }

  return {
    /** Personal domains and malformed input never reach the server (T-UNIT-AUTH-02). */
    async lookupSchool(input: string): Promise<SchoolLookup> {
      const domain = emailDomain(input);
      if (!domain) return { kind: 'invalid' };
      if (isPersonalDomain(domain)) return { kind: 'personal' };
      const row = await rpc<{
        campus_id: string;
        name: string;
        short_name: string;
        status: School['status'];
        is_review: boolean;
      } | null>('lookup_school', { domain });
      if (!row) return { kind: 'unknown' };
      return {
        kind: 'school',
        school: {
          campusId: row.campus_id,
          name: row.name,
          shortName: row.short_name,
          status: row.status,
          isReview: row.is_review,
        },
      };
    },

    /** Emails a 6-digit code. New addresses get an account (the Auth hook checks the school). */
    async sendCode(input: string, options: { inviteCode?: string } = {}): Promise<void> {
      const email = requireEmail(input);
      const invite = options.inviteCode?.trim();
      const { error } = await deps.auth().signInWithOtp({
        email,
        options: { shouldCreateUser: true, ...(invite ? { data: { invite_code: invite } } : {}) },
      });
      if (error) throw authError(error);
    },

    async verifyCode(input: string, code: string): Promise<Session> {
      const email = requireEmail(input);
      const token = code.replace(/\D/g, '');
      const { data, error } = await deps.auth().verifyOtp({ email, token, type: 'email' });
      if (error) throw authError(error);
      if (!data?.session) throw toAppError({ message: 'no session' });
      return data.session;
    },

    /** App Store / Play reviewer accounts only (DEC 6). */
    async signInReviewer(input: string, password: string): Promise<Session> {
      const email = requireEmail(input);
      const { data, error } = await deps.auth().signInWithPassword({ email, password });
      if (error) throw authError(error);
      if (!data?.session) throw toAppError({ message: 'no session' });
      return data.session;
    },

    /** `global` signs out every device (Settings, PM-03). */
    async signOut(scope: 'local' | 'global' = 'local'): Promise<void> {
      const { error } = await deps.auth().signOut({ scope });
      if (error) throw toAppError(error);
    },

    /** 18+ check (A05). A birth date is sent once and never stored (T-INT-AUTH-04). */
    async confirmAge(
      input:
        { method: 'os_signal'; isAdult: boolean } | { method: 'self_declared'; birthDate: string },
    ): Promise<{ adult: boolean }> {
      return rpc<{ adult: boolean }>(
        'confirm_age',
        input.method === 'os_signal'
          ? { method: 'os_signal', is_adult: input.isAdult }
          : { method: 'self_declared', birth_date: input.birthDate },
      );
    },

    /** After confirm_age said minor: remove the account right away (F02, P4-DEL-01). */
    async deleteUnderageAccount(): Promise<void> {
      if (!deps.functions) throw toAppError({ message: 'functions unavailable' });
      const { error } = await deps.functions().invoke('delete-account', {
        body: { mode: 'underage' },
      });
      if (error) throw toAppError(error);
    },

    /** A school we don't support yet (A5). The Edge Function arrives with P4-AUTH-11. */
    async joinWaitlist(input: string): Promise<void> {
      const email = requireEmail(input);
      if (!deps.functions) throw toAppError({ message: 'functions unavailable' });
      const { error } = await deps.functions().invoke('waitlist-request', { body: { email } });
      if (error) throw toAppError(error);
    },

    async getAppConfig(): Promise<AppConfig> {
      return parseAppConfig(await rpc<unknown>('get_app_config'));
    },

    /** The fields the launch gate needs, from the caller's own row (RLS). */
    async getGateProfile(userId: string): Promise<GateProfile | null> {
      const { data, error } = await deps.profile(userId);
      if (error) throw toAppError(error);
      if (!data) return null;
      return {
        status: data.status,
        firstName: data.first_name,
        adultConfirmed: data.adult_confirmed_at !== null,
        rulesVersion: data.rules_version,
      };
    },
  };
}

export type AuthApi = ReturnType<typeof createAuthApi>;

export const authApi: AuthApi = createAuthApi({
  auth: () => getSupabase().auth,
  rpc: () => getSupabase() as unknown as RpcClient,
  functions: () => getSupabase().functions as unknown as FunctionsClient,
  profile: (userId) =>
    getSupabase()
      .from('profiles')
      .select('status, first_name, adult_confirmed_at, rules_version')
      .eq('id', userId)
      .maybeSingle<ProfileRow>(),
});
