/**
 * Remembers that the person tapped "I already have an account" (A03 login
 * mode). The code step answers the same way for every school address
 * (SECURITY T16, no account enumeration), so a new address still gets an
 * account. Only after the code is verified does the birthday step use this
 * to say so, which reveals nothing to someone who doesn't own the inbox.
 */
let loginIntent = false;

export function setLoginIntent(value: boolean): void {
  loginIntent = value;
}

export function hadLoginIntent(): boolean {
  return loginIntent;
}
