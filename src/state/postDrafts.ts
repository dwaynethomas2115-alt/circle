export interface PostDraftMedia {
  id: string;
  uri: string;
  type: "image" | "video";
  width: number;
  height: number;
  duration?: number;
  bytes?: number;
  name?: string;
  mimeType?: string;
}
export interface PostDraft {
  circleId: string;
  /** Route that opened this composer; the user may then select another Circle. */
  routeCircleId?: string;
  content: string;
  media: PostDraftMedia[];
  activeId: string | null;
}
export interface PostDraftAccess {
  status: "unknown" | "authenticated" | "signedOut";
  accountId?: string | null;
  circleIds: readonly string[];
}
export interface PostDraftLease {
  readonly id: number;
  readonly epoch: number;
  readonly accountId: string;
  readonly circleId: string;
}
const copy = (draft: PostDraft): PostDraft => ({
  ...draft,
  media: draft.media.map((item) => ({ ...item })),
});
const localUri = /^(?:file:|blob:|data:|content:|ph:|assets-library:)/i;

/** One provider-lifetime draft, never persisted or used as a private-media cache.
 * Uncertainty hides the UI and revokes write leases while retaining local input.
 */
export function createPostDraftStore() {
  let policy: PostDraftAccess = { status: "unknown", circleIds: [] };
  let policyKey = "";
  let epoch = 0;
  let lastOpenedId = 0;
  let saved: { accountId: string; leaseId: number; draft: PostDraft } | null =
    null;
  function clear() {
    saved = null;
    epoch++;
  }
  function allowed(circleId: string) {
    return (
      policy.status === "authenticated" &&
      !!policy.accountId &&
      policy.circleIds.includes(circleId)
    );
  }
  function isCurrent(
    lease: PostDraftLease | null | undefined,
  ): lease is PostDraftLease {
    return (
      !!lease &&
      lease.epoch === epoch &&
      lease.id === lastOpenedId &&
      lease.accountId === policy.accountId &&
      allowed(lease.circleId)
    );
  }
  return {
    observe(next: PostDraftAccess) {
      const key = JSON.stringify([
        next.status,
        next.accountId || "",
        [...next.circleIds].sort(),
      ]);
      if (key !== policyKey) epoch++;
      policyKey = key;
      policy = { ...next, circleIds: [...next.circleIds] };
      if (
        next.status === "signedOut" ||
        (saved && next.accountId && saved.accountId !== next.accountId) ||
        (saved &&
          next.status === "authenticated" &&
          !next.circleIds.includes(saved.draft.circleId))
      )
        clear();
    },
    restore(requestedCircleId?: string): PostDraft | null {
      if (
        !saved ||
        saved.accountId !== policy.accountId ||
        !allowed(saved.draft.circleId) ||
        (requestedCircleId &&
          requestedCircleId !== saved.draft.circleId &&
          requestedCircleId !== saved.draft.routeCircleId)
      )
        return null;
      return copy(saved.draft);
    },
    open(circleId: string): PostDraftLease | null {
      if (!allowed(circleId)) return null;
      return {
        id: ++lastOpenedId,
        epoch,
        accountId: policy.accountId!,
        circleId,
      };
    },
    isCurrent,
    write(lease: PostDraftLease | null, draft: PostDraft): boolean {
      if (
        !isCurrent(lease) ||
        draft.circleId !== lease.circleId ||
        draft.media.length > 10 ||
        draft.media.some((item) => !localUri.test(item.uri))
      )
        return false;
      saved = {
        accountId: lease.accountId,
        leaseId: lease.id,
        draft: copy(draft),
      };
      return true;
    },
    complete(lease: PostDraftLease | null): boolean {
      // A confirmed post can arrive after recovery revoked its write lease. Only
      // clear that exact draft; never erase a newer mount/account/Circle's input.
      if (
        !lease ||
        lease.id !== lastOpenedId ||
        saved?.leaseId !== lease.id ||
        saved.accountId !== lease.accountId ||
        saved.draft.circleId !== lease.circleId
      )
        return false;
      clear();
      return true;
    },
    clear,
  };
}
export type PostDraftStore = ReturnType<typeof createPostDraftStore>;
