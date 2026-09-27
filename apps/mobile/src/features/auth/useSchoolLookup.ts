import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { authApi, type AuthApi, type SchoolLookup } from './api';
import { emailDomain, isPersonalDomain } from './logic';

/** Wait this long after the last keystroke before asking the server (30/min/IP limit). */
export const LOOKUP_DEBOUNCE_MS = 350;

export type LookupView =
  | { kind: 'empty' }
  | { kind: 'typing' }
  | { kind: 'checking' }
  | { kind: 'error'; error: unknown }
  | SchoolLookup;

/**
 * Detects the school as the student types (A3). Personal domains answer
 * instantly on the device; school domains are looked up once per domain.
 */
export function useSchoolLookup(email: string, api: AuthApi = authApi): LookupView {
  const domain = emailDomain(email);
  const [settled, setSettled] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSettled(domain), LOOKUP_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [domain]);

  const needsServer = settled !== null && settled === domain && !isPersonalDomain(settled);
  const query = useQuery({
    queryKey: ['school', settled],
    queryFn: () => api.lookupSchool(`x@${settled as string}`),
    enabled: needsServer,
    staleTime: 10 * 60_000,
  });

  if (email.trim() === '') return { kind: 'empty' };
  if (!domain) return { kind: 'typing' };
  if (isPersonalDomain(domain)) return { kind: 'personal' };
  if (!needsServer) return { kind: 'typing' };
  if (query.data) return query.data;
  if (query.isError) return { kind: 'error', error: query.error };
  return { kind: 'checking' };
}
