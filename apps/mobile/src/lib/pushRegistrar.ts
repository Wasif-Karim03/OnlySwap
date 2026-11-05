/**
 * Push token registration without feedback loops (QA H1).
 *
 * `getExpoPushTokenAsync` fetches the device token again, and that fires the
 * push-token listener again. If the listener re-registers on every event, the app
 * loops and floods `register_push_token`. The registrar breaks the loop three ways:
 * - listener events with an unchanged device token are ignored;
 * - concurrent calls share one in-flight registration;
 * - the RPC is skipped when this user and token were already registered.
 */

export interface PushRegistrarDeps {
  /** The Expo push token, or null when push isn't allowed. */
  getToken: () => Promise<string | null>;
  /** The signed-in user, so a new account on the same device still registers. */
  getUserId: () => Promise<string | null>;
  /** Stores the token on the server. */
  send: (token: string) => Promise<void>;
}

export interface PushRegistrar {
  /** Registers the current token once; repeat calls are no-ops until it changes. */
  register: () => Promise<string | null>;
  /** Push-token listener: re-registers only when the device token really changed. */
  onDeviceToken: (deviceToken: string) => Promise<string | null>;
  /** Forget what was registered (sign-out), so the next sign-in registers again. */
  reset: () => void;
}

export function createPushRegistrar(deps: PushRegistrarDeps): PushRegistrar {
  let inFlight: Promise<string | null> | null = null;
  let registeredKey: string | null = null;
  let lastDeviceToken: string | null = null;

  const doRegister = async (): Promise<string | null> => {
    const token = await deps.getToken();
    if (!token) return null;
    const key = `${(await deps.getUserId()) ?? ''}:${token}`;
    if (key === registeredKey) return token;
    await deps.send(token);
    registeredKey = key;
    return token;
  };

  const register = (): Promise<string | null> => {
    if (inFlight) return inFlight;
    // Start on the next microtask so `inFlight` is set before the token fetch
    // runs: a listener event fired by that fetch then joins this registration.
    const run = Promise.resolve()
      .then(doRegister)
      .finally(() => {
        inFlight = null;
      });
    inFlight = run;
    return run;
  };

  const onDeviceToken = (deviceToken: string): Promise<string | null> => {
    if (deviceToken === lastDeviceToken) return Promise.resolve(null);
    lastDeviceToken = deviceToken;
    return register();
  };

  const reset = (): void => {
    registeredKey = null;
    lastDeviceToken = null;
  };

  return { register, onDeviceToken, reset };
}
