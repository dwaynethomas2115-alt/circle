import test from "node:test";
import assert from "node:assert/strict";
import { resolveHref } from "expo-router/build/link/href";
import {
  buildCircleAppUrl,
  buildCircleInviteUrl,
  invitationAuthReturn,
  invitationAuthContext,
  invitationAuthFragment,
  invitationAuthRoute,
  invitationCodeFromFragment,
  invitationCodeFromUrl,
  invitationJoinRoute,
  normalizeInvitationCode,
} from "./inviteLinks";

const origin = "https://circle.example.test";
const token = "0123456789ABCDEF".repeat(3);

test("private invitation links use fragments and general app links contain no invitation", () => {
  const link = new URL(buildCircleInviteUrl(token.toLowerCase(), origin));
  assert.equal(link.origin, origin);
  assert.equal(link.pathname, "/join");
  assert.equal(link.search, "");
  assert.equal(link.hash, `#invite=${token}`);
  const general = new URL(buildCircleAppUrl(origin));
  assert.equal(general.pathname, "/welcome");
  assert.equal(general.hash, "");
  assert.equal(general.search, "");
  assert.ok(!general.toString().includes(token));
});

test("existing manual demo codes and production tokens normalize without altering embedded characters", () => {
  for (const code of ["a", "FAMILY2026", "abc123xy", token, "Z".repeat(128)]) {
    assert.equal(normalizeInvitationCode(` ${code} `), code.toUpperCase());
    assert.equal(invitationCodeFromUrl(code, origin), code.toUpperCase());
  }
  for (const value of [
    null,
    [token],
    {},
    "",
    "A".repeat(129),
    "FAMILY CODE",
    "A\nB",
    "CODE/OTHER",
    "CODE?other",
    "CODE#OTHER",
    "éclair",
  ]) {
    assert.equal(normalizeInvitationCode(value), "");
  }
  assert.throws(() => buildCircleInviteUrl("invalid code", origin), /invalid/i);
});

test("join links accept only this app's join route and one bounded invite fragment", () => {
  assert.equal(
    invitationCodeFromUrl(buildCircleInviteUrl(token, origin), origin),
    token,
  );
  assert.equal(invitationCodeFromUrl(`/join#invite=${token}`, origin), token);
  assert.equal(
    invitationCodeFromUrl(`${origin}/join/#invite=family2026`, origin),
    "FAMILY2026",
  );
  for (const link of [
    `https://elsewhere.example/join#invite=${token}`,
    `${origin}/profile#invite=${token}`,
    `${origin}/join?code=${token}`,
    `${origin}/join?next=https://elsewhere.example#invite=${token}`,
    `${origin}/join#invite=${token}&invite=OTHER`,
    `${origin}/join#invite=${token}&next=/profile`,
    `${origin}/join#invite=${token}%0A`,
    `${origin}/join#invite=`,
    `${origin}/join#invite=${"X".repeat(129)}`,
    `https://name:password@circle.example.test/join#invite=${token}`,
    `javascript:alert(1)#invite=${token}`,
  ])
    assert.equal(invitationCodeFromUrl(link, origin), "", link);
  assert.equal(invitationCodeFromFragment([`invite=${token}`]), "");
  assert.equal(invitationCodeFromFragment(`invite=${token}%ZZ`), "");
});

test("authentication continuation retains only the private fragment and a fixed join destination", () => {
  for (const mode of ["signin", "signup"] as const) {
    const route = invitationAuthRoute(mode, token);
    assert.equal(route, `/auth#invite=${token}&mode=${mode}&next=join`);
    const resolved = new URL(resolveHref(route), origin);
    assert.equal(resolved.pathname, "/auth");
    assert.equal(resolved.search, "");
    const context = invitationAuthContext(resolved.hash);
    assert.deepEqual(context, { mode, next: "join", code: token });
    // Expo Router web startup uses pathname + hash + search, in that order.
    const afterStartup = new URL(
      resolved.pathname + resolved.hash + resolved.search,
      origin,
    );
    assert.deepEqual(invitationAuthContext(afterStartup.hash), context);
    assert.equal(
      invitationAuthReturn(context?.next, resolved.hash),
      `/join#invite=${token}`,
    );
    const joined = new URL(
      resolveHref(invitationAuthReturn("join", resolved.hash)),
      origin,
    );
    assert.equal(joined.pathname, "/join");
    assert.equal(joined.search, "");
    assert.equal(invitationCodeFromFragment(joined.hash), token);
  }
  for (const next of [
    undefined,
    null,
    ["join"],
    "/join",
    "//elsewhere.example",
    "https://elsewhere.example",
    "join?next=/profile",
  ]) {
    assert.equal(
      invitationAuthReturn(next, invitationAuthFragment("signin", token)),
      "/",
    );
  }
  assert.equal(invitationAuthReturn("join", "invite=bad%0Acode"), "/");
  assert.equal(invitationJoinRoute(undefined), "/join");
  assert.equal(
    resolveHref(invitationJoinRoute(token)),
    `/join#invite=${token}`,
  );
});

test("invited auth fragments reject duplicate, malformed, or external continuation values", () => {
  assert.deepEqual(
    invitationAuthContext(invitationAuthFragment("signup", undefined)),
    {
      mode: "signup",
      next: "join",
      code: "",
    },
  );
  for (const fragment of [
    `invite=${token}&mode=signin&next=https://elsewhere.example`,
    `invite=${token}&mode=signin&next=join&next=join`,
    `invite=${token}&mode=signin&next=join&invite=OTHER`,
    `invite=${token}&mode=signin&next=join&extra=value`,
    `invite=${token}%0A&mode=signin&next=join`,
    `invite=${token}&mode=unknown&next=join`,
    `invite=${token}&next=join`,
    `invite=${token}?mode=signin&next=join`,
    `invite=&mode=signin&next=join`,
    `invite=${"Z".repeat(129)}&mode=signin&next=join`,
  ])
    assert.equal(invitationAuthContext(fragment), null, fragment);
  assert.equal(
    invitationAuthContext([invitationAuthFragment("signin", token)]),
    null,
  );
});

test("share URLs discard configuration query/fragment/path and reject unsafe protocols", () => {
  assert.equal(
    buildCircleAppUrl(`${origin}/somewhere?secret=value#token`),
    `${origin}/welcome`,
  );
  assert.equal(
    buildCircleAppUrl("http://localhost:8081"),
    "http://localhost:8081/welcome",
  );
  for (const bad of [
    "http://elsewhere.example",
    "javascript:alert(1)",
    "data:text/plain,hello",
    "https://user:password@elsewhere.example",
  ]) {
    const url = new URL(buildCircleAppUrl(bad));
    assert.equal(url.protocol, "https:");
    assert.equal(url.username, "");
    assert.equal(url.password, "");
    assert.equal(url.pathname, "/welcome");
  }
});
