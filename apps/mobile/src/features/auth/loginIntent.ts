/**
 * Remembers that the person tapped "I already have an account" (A03 login
 * mode), so the code step leaves out the sign-up step counter. Login mode
 * only sends a code to an existing account (DEC 140).
 */
let loginIntent = false;

export function setLoginIntent(value: boolean): void {
  loginIntent = value;
}

export function hadLoginIntent(): boolean {
  return loginIntent;
}
