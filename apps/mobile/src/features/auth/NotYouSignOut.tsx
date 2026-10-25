import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Button } from '@/components/Button';
import { nav as copy } from '@/strings';

import { authApi, type AuthApi } from './api';

/**
 * A quiet way out of the signed-in onboarding steps (Birthday, Profile,
 * Rules) for someone who signed in with the wrong email (UX audit 2026-10-25).
 */
export function NotYouSignOut({ api = authApi }: { api?: Pick<AuthApi, 'signOut'> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      label={copy.notYou}
      variant="text"
      size="S"
      fullWidth={false}
      loading={busy}
      onPress={async () => {
        setBusy(true);
        try {
          await api.signOut('local');
        } catch {
          // Signed out locally either way; Welcome works without a session.
        }
        router.replace('/welcome');
      }}
      testID="auth-not-you"
    />
  );
}
