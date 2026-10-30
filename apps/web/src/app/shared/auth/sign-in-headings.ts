import { type SignInMode } from './sign-in-form.component';

/** The translation keys a host titles the sign-in form with, one pair per mode. */
export interface SignInHeading {
  title: string;
  lead: string | null;
}

/**
 * Only the plain sign-in differs between hosts, so each passes its own; the other modes say the
 * same thing wherever the form sits.
 */
export function signInHeadings(signIn: SignInHeading): Record<SignInMode, SignInHeading> {
  return {
    login: signIn,
    register: signIn,
    forgot: { title: 'auth.forgot.title', lead: 'auth.forgot.intro' },
    inbox: { title: 'auth.inbox.title', lead: null },
  };
}
