import type { AppState } from "../types";
import { emptyCircle } from "../state/empty";

export interface SessionAccount {
  $id: string;
  email: string;
  name?: string;
}
export type AuthStatus = "unknown" | "authenticated" | "signedOut";
export interface SessionReader<T extends SessionAccount = SessionAccount> {
  get(): Promise<T>;
}
export interface SessionService<
  T extends SessionAccount = SessionAccount,
> extends SessionReader<T> {
  createEmailPasswordSession(input: {
    email: string;
    password: string;
  }): Promise<unknown>;
}

/** SDK failures use numeric code; Function execution failures use numeric status. */
export function sessionHttpStatus(cause: unknown): number | undefined {
  if (!cause || typeof cause !== "object") return;
  const value = cause as { status?: unknown; code?: unknown };
  if (typeof value.status === "number") return value.status;
  if (typeof value.code === "number") return value.code;
}

export async function readSessionAccount<T extends SessionAccount>(
  service: SessionReader<T>,
): Promise<T | null> {
  try {
    return await service.get();
  } catch (cause) {
    if (sessionHttpStatus(cause) === 401) return null;
    throw cause;
  }
}

export class SessionAccountMismatch extends Error {
  readonly code = "session_account_mismatch";
  constructor() {
    super(
      "A different account is already signed in. Continue with that account, or sign out before signing in to this one.",
    );
  }
}
function matchingAccount<T extends SessionAccount>(
  account: T,
  email: string,
): T {
  if (account.email.trim().toLowerCase() !== email.trim().toLowerCase())
    throw new SessionAccountMismatch();
  return account;
}

/** Reuse only a freshly verified matching session; never delete or switch one. */
export async function signInWithSession<T extends SessionAccount>(
  service: SessionService<T>,
  email: string,
  password: string | undefined,
): Promise<T> {
  if (!password) throw new Error("Enter your password.");
  const existing = await readSessionAccount(service);
  if (existing) return matchingAccount(existing, email);
  try {
    await service.createEmailPasswordSession({ email: email.trim(), password });
  } catch (cause) {
    const status = sessionHttpStatus(cause);
    const type = (cause as { type?: unknown } | null)?.type;
    // A concurrent tab or a lost POST response can leave a valid session open.
    // Invalid credentials and other definitive request failures stay failures.
    if (
      type === "user_session_already_exists" ||
      status === undefined ||
      status === 0 ||
      status === 408 ||
      (status !== undefined && status >= 500)
    ) {
      const recovered = await readSessionAccount(service).catch(() => null);
      if (recovered) return matchingAccount(recovered, email);
    }
    throw cause;
  }
  const verified = await readSessionAccount(service);
  if (!verified)
    throw new Error(
      "Circle could not verify the new sign-in. Please try again.",
    );
  return matchingAccount(verified, email);
}

export interface SessionRefreshResult {
  status: AuthStatus;
  state: AppState;
  error: string | null;
}

/** Own identity only: no prior avatar links, memberships, or private content. */
function identityOnly(account?: SessionAccount): AppState {
  const state = emptyCircle();
  if (account) {
    state.currentUserId = account.$id;
    state.users = [
      {
        id: account.$id,
        name: account.name || "Your account",
        email: account.email,
        username: "",
        avatar: "",
        bio: "",
      },
    ];
  }
  return state;
}
function unavailable(
  error: string,
  account?: SessionAccount,
): SessionRefreshResult {
  return { status: "unknown", state: identityOnly(account), error };
}
const signedOut = (): SessionRefreshResult => ({
  status: "signedOut",
  state: emptyCircle(),
  error: null,
});

/** A failed data refresh must not masquerade as successful session deletion. */
export async function loadSessionSnapshot(services: {
  currentAccount(): Promise<SessionAccount | null>;
  snapshot(): Promise<AppState>;
  /** Injectable for deterministic tests; production waits briefly between reads. */
  waitForConflictRetry?: (retry: number) => Promise<void>;
}): Promise<SessionRefreshResult> {
  // Upload finalization and other legitimate writes can invalidate the snapshot's
  // authorization guard. Retry only that 409, at most twice, with fresh identity
  // and a wholly new authorized projection. Never reuse the rejected read.
  for (let attempt = 0; ; attempt++) {
    let account: SessionAccount | null;
    try {
      account = await services.currentAccount();
    } catch (cause) {
      if (sessionHttpStatus(cause) === 401) return signedOut();
      return unavailable(
        sessionHttpStatus(cause) === 403
          ? "Circle could not access your account. Please check your sign-in or try again."
          : "Circle could not check your sign-in. Please reconnect before continuing.",
      );
    }
    if (!account) return signedOut();
    try {
      const state = await services.snapshot();
      if (
        state.currentUserId !== account.$id ||
        !state.users.some((profile) => profile.id === account.$id)
      )
        return unavailable(
          "Your account changed while Circle was refreshing. Please reconnect.",
        );
      return { status: "authenticated", state, error: null };
    } catch (cause) {
      if (sessionHttpStatus(cause) === 409 && attempt < 2) {
        try {
          const retry = attempt + 1;
          if (services.waitForConflictRetry)
            await services.waitForConflictRetry(retry);
          else
            await new Promise<void>((resolve) =>
              setTimeout(resolve, retry * 100),
            );
        } catch {
          return unavailable(
            "Circle could not recheck your connection. Please try again.",
            account,
          );
        }
        continue;
      }
      if (sessionHttpStatus(cause) === 401) {
        // A cookie can expire after the first account check, while a Function's
        // own authentication can fail independently of an otherwise valid cookie.
        try {
          const latest = await services.currentAccount();
          if (!latest) return signedOut();
          return unavailable(
            latest.$id === account.$id
              ? "Your account is still signed in, but Circle could not load your private data. Please reconnect."
              : "Your account changed while Circle was refreshing. Please reconnect.",
            latest,
          );
        } catch (checkFailure) {
          if (sessionHttpStatus(checkFailure) === 401) return signedOut();
          return unavailable(
            "Circle could not recheck your sign-in. Please reconnect before continuing.",
          );
        }
      }
      return unavailable(
        "Your account is still signed in, but Circle could not refresh your private data. Please try again.",
        account,
      );
    }
  }
}

/** Coalesce read refreshes and fence them across auth changes and unmounts. */
export function createSessionRefresher(
  load: () => Promise<SessionRefreshResult>,
  commit: (result: SessionRefreshResult) => void,
) {
  let epoch = 0;
  let active = true;
  let paused = false;
  let flight: { epoch: number; promise: Promise<void> } | undefined;
  const invalidate = () => {
    epoch++;
    flight = undefined;
  };
  return {
    invalidate,
    setActive(value: boolean) {
      active = value;
      invalidate();
    },
    setPaused(value: boolean) {
      paused = value;
      invalidate();
    },
    refresh(): Promise<void> {
      if (!active || paused) return Promise.resolve();
      if (flight?.epoch === epoch) return flight.promise;
      const requestedEpoch = epoch;
      const promise = Promise.resolve()
        .then(load)
        .catch(() =>
          unavailable("Circle could not reconnect. Please try again."),
        )
        .then((result) => {
          if (active && !paused && epoch === requestedEpoch) commit(result);
        })
        .finally(() => {
          if (flight?.promise === promise) flight = undefined;
        });
      flight = { epoch: requestedEpoch, promise };
      return promise;
    },
  };
}
