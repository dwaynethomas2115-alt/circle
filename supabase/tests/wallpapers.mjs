/** Apply exact migrations and exercise private wallpaper storage and atomic budgets. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
const ids = {
  owner: "00000000-0000-0000-0000-000000000001",
  member: "00000000-0000-0000-0000-000000000002",
  outsider: "00000000-0000-0000-0000-000000000003",
  admin: "00000000-0000-0000-0000-000000000004",
};
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const palette = {
  id: "wallpaper",
  label: "Pink adventures",
  prompt: "Pink dolls, tornadoes and volcanoes",
  accent: "#A43E78",
  background: "#FFF5FA",
  surface: "#FFFFFF",
  ink: "#493044",
  motif: "unicorn",
  source: "ai",
};
test("AI wallpapers have private paths, manager provenance, and successful-generation budgets", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  t.after(() => db.close());
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;create schema extensions;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,storage to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,unique(bucket_id,name));
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;create publication supabase_realtime;`);
  for (const file of [
    "202610270001_circle.sql",
    "202610290001_circle_features.sql",
    "202610300001_circle_wallpapers.sql",
  ])
    await db.exec(
      await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"),
    );
  const as = async (who) =>
    db.exec(
      `reset role;select set_config('request.jwt.claim.sub',${q(ids[who] || "")},false);set role ${who === "anon" ? "anon" : who === "service" ? "service_role" : "authenticated"};`,
    );
  const scalar = async (sql) => (await db.query(sql)).rows[0]?.value;
  const deny = async (
    sql,
    pattern = /permission|policy|Manager|unavailable|Invalid|invalid|limit|missing|server-generated|already/i,
  ) => assert.rejects(db.query(sql), pattern);
  for (const [name, id] of Object.entries(ids))
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)values($1,$2,now(),$3)",
      [
        id,
        `${name}@circle.test`,
        JSON.stringify({ name, username: name, adult_confirmed: true }),
      ],
    );
  await as("owner");
  const circle = await scalar(
    `select (public.create_circle('Wallpaper Circle')).id as value`,
  );
  const other = await scalar(
    `select (public.create_circle('Another Circle')).id as value`,
  );
  for (const name of ["member", "admin"]) {
    await as("owner");
    const token = await scalar(
      `select public.create_invitation(${q(circle)}) as value`,
    );
    await as(name);
    await db.query(`select public.accept_invitation(${q(token)})`);
  }
  await as("owner");
  await db.query(
    `select public.change_member_role(${q(circle)},${q(ids.admin)},'admin')`,
  );
  const reserve = async (daily = 50, burst = 3) => {
    await as("service");
    return scalar(
      `select public.reserve_theme_wallpaper_generation(${q(circle)},${q(ids.owner)},${daily},${burst}) as value`,
    );
  };
  const ageAttempts = async () => {
    await db.exec(
      `reset role;update public.circle_theme_generation_requests set created_at=clock_timestamp()-interval '2 minutes' where user_id=${q(ids.owner)};`,
    );
  };
  const finish = async (request) => {
    const theme = {
      ...palette,
      id: request,
      wallpaperPath: `${circle}/${request}.webp`,
    };
    await db.exec(
      `reset role;insert into storage.objects(bucket_id,name)values('circle-wallpapers',${q(theme.wallpaperPath)})`,
    );
    await as("service");
    await db.query(
      `select public.complete_theme_generation(${q(request)},${q(JSON.stringify(theme))})`,
    );
    return theme;
  };
  let theme;
  await t.test(
    "wallpaper bucket is private and neither clients nor members can reserve arbitrary budgets or upload images",
    async () => {
      await db.exec("reset role");
      assert.equal(
        await scalar(
          `select public as value from storage.buckets where id='circle-wallpapers'`,
        ),
        false,
      );
      for (const who of ["owner", "member", "outsider", "anon"]) {
        await as(who);
        await deny(
          `select public.reserve_theme_wallpaper_generation(${q(circle)},${q(ids.owner)},200,10)`,
        );
        await deny(
          `select public.fail_theme_wallpaper_generation(gen_random_uuid())`,
        );
        await deny(
          `insert into storage.objects(bucket_id,name)values('circle-wallpapers','anything')`,
        );
      }
      await as("service");
      await deny(
        `select public.reserve_theme_wallpaper_generation(${q(circle)},${q(ids.member)},50,3)`,
      );
      await deny(
        `select public.reserve_theme_wallpaper_generation(${q(circle)},${q(ids.owner)},201,3)`,
      );
    },
  );
  await t.test(
    "one pending wallpaper blocks concurrent charges; failed requests release daily hold",
    async () => {
      const request = await reserve(1, 10);
      await deny(
        `select public.reserve_theme_wallpaper_generation(${q(circle)},${q(ids.owner)},1,10)`,
        /already/,
      );
      await as("service");
      await db.query(
        `select public.fail_theme_wallpaper_generation(${q(request)})`,
      );
      const retry = await reserve(1, 10);
      assert.notEqual(retry, request);
      await as("service");
      await db.query(
        `select public.fail_theme_wallpaper_generation(${q(retry)})`,
      );
    },
  );
  await t.test(
    "short burst guard still limits repeated failed provider attempts",
    async () => {
      const request = await reserve(50, 3);
      await db.query(
        `select public.fail_theme_wallpaper_generation(${q(request)})`,
      );
      await deny(
        `select public.reserve_theme_wallpaper_generation(${q(circle)},${q(ids.owner)},50,3)`,
        /rate limit/,
      );
      await ageAttempts();
    },
  );
  await t.test(
    "a server proposal must point at its own stored image and current manager",
    async () => {
      const request = await reserve();
      await as("service");
      await deny(
        `select public.complete_theme_generation(${q(request)},${q(JSON.stringify({ ...palette, wallpaperPath: `${other}/${request}.webp` }))})`,
        /Invalid/,
      );
      await deny(
        `select public.complete_theme_generation(${q(request)},${q(JSON.stringify({ ...palette, wallpaperPath: `${circle}/${request}.webp` }))})`,
        /missing/,
      );
      theme = await finish(request);
      await as("owner");
      await deny(
        `select public.complete_theme_generation(${q(request)},${q(JSON.stringify(theme))})`,
      );
      await deny(
        `select public.save_circle_theme(${q(other)},${q(JSON.stringify(theme))})`,
      );
      await ageAttempts();
    },
  );
  await t.test(
    "completion is idempotent after a lost response; only service can confirm exact proposal status",
    async () => {
      await as("service");
      const request = theme.wallpaperPath.split("/")[1].replace(".webp", "");
      assert.equal(
        await scalar(
          `select public.is_theme_wallpaper_generation_complete(${q(request)},${q(JSON.stringify(theme))}) as value`,
        ),
        true,
      );
      await db.query(
        `select public.complete_theme_generation(${q(request)},${q(JSON.stringify(theme))})`,
      );
      assert.equal(
        await scalar(
          `select public.is_theme_wallpaper_generation_complete(${q(request)},${q(JSON.stringify({ ...theme, label: "Another proposal" }))}) as value`,
        ),
        false,
      );
      await deny(
        `select public.complete_theme_generation(${q(request)},${q(JSON.stringify({ ...theme, label: "Another proposal" }))})`,
      );
      await db.exec("reset role");
      assert.equal(
        await scalar(
          `select count(*)::integer as value from public.circle_theme_generation_requests where status='completed'`,
        ),
        1,
      );
      for (const who of ["owner", "member", "outsider", "anon"]) {
        await as(who);
        await deny(
          `select public.is_theme_wallpaper_generation_complete(${q(request)},${q(JSON.stringify(theme))})`,
        );
      }
    },
  );
  await t.test(
    "preview is readable only by requesting current manager; members can read after apply",
    async () => {
      for (const who of ["member", "admin", "outsider"]) {
        await as(who);
        assert.equal(
          await scalar(
            `select count(*)::integer as value from storage.objects where bucket_id='circle-wallpapers'`,
          ),
          0,
          who,
        );
      }
      await as("owner");
      assert.equal(
        await scalar(
          `select count(*)::integer as value from storage.objects where bucket_id='circle-wallpapers'`,
        ),
        1,
      );
      await db.query(
        `select public.save_circle_theme(${q(circle)},${q(JSON.stringify(theme))})`,
      );
      await as("member");
      assert.equal(
        await scalar(
          `select count(*)::integer as value from storage.objects where bucket_id='circle-wallpapers'`,
        ),
        1,
      );
      await deny(
        `select public.save_circle_theme(${q(circle)},${q(JSON.stringify(theme))})`,
      );
      await as("outsider");
      assert.equal(
        await scalar(
          `select count(*)::integer as value from storage.objects where bucket_id='circle-wallpapers'`,
        ),
        0,
      );
    },
  );
  await t.test(
    "external URLs, forged paths, unknown keys and oversized prompts cannot become wallpaper themes",
    async () => {
      await as("owner");
      for (const bad of [
        { ...theme, wallpaperPath: "https://evil.test/image.webp" },
        { ...theme, wallpaperPath: `${circle}/../image.webp` },
        { ...theme, source: "preset" },
        { ...theme, script: "evil" },
        { ...theme, prompt: "x".repeat(1001) },
      ])
        await deny(
          `select public.save_circle_theme(${q(circle)},${q(JSON.stringify(bad))})`,
        );
    },
  );
  await t.test(
    "daily quota counts successful images, gives exact reset metadata, and spans Circles",
    async () => {
      const request = await reserve(2, 10);
      await finish(request);
      await ageAttempts();
      await as("service");
      let error;
      try {
        await db.query(
          `select public.reserve_theme_wallpaper_generation(${q(other)},${q(ids.owner)},2,10)`,
        );
      } catch (value) {
        error = value;
      }
      assert.ok(error);
      assert.match(error.message, /daily limit/);
      const detail = JSON.parse(error.detail);
      assert.equal(detail.kind, "daily");
      assert.equal(detail.limit, 2);
      assert.ok(detail.retryAfter > 3600);
      assert.ok(Date.parse(detail.resetAt) > Date.now());
    },
  );
  await t.test(
    "abandoned pending holds expire and completion after failure is denied",
    async () => {
      await db.exec(
        `reset role;update public.circle_theme_generation_requests set created_at=clock_timestamp()-interval '25 hours' where user_id=${q(ids.owner)};`,
      );
      const abandoned = await reserve();
      await db.exec(
        `reset role;update public.circle_theme_generation_requests set created_at=clock_timestamp()-interval '11 minutes' where id=${q(abandoned)}`,
      );
      const next = await reserve();
      assert.notEqual(next, abandoned);
      await as("service");
      await deny(
        `select public.complete_theme_generation(${q(abandoned)},${q(JSON.stringify(theme))})`,
      );
      await db.query(
        `select public.fail_theme_wallpaper_generation(${q(next)})`,
      );
    },
  );
  await t.test(
    "removal immediately removes new storage reads and manager revocation prevents completion",
    async () => {
      await as("owner");
      await db.query(
        `select public.remove_circle_member(${q(circle)},${q(ids.member)})`,
      );
      await as("member");
      assert.equal(
        await scalar(
          `select count(*)::integer as value from storage.objects where bucket_id='circle-wallpapers'`,
        ),
        0,
      );
      await as("service");
      const request = await scalar(
        `select public.reserve_theme_wallpaper_generation(${q(circle)},${q(ids.admin)},50,3) as value`,
      );
      await as("owner");
      await db.query(
        `select public.change_member_role(${q(circle)},${q(ids.admin)},'member')`,
      );
      await as("service");
      await deny(
        `select public.complete_theme_generation(${q(request)},${q(JSON.stringify({ ...theme, wallpaperPath: `${circle}/${request}.webp` }))})`,
        /revoked/,
      );
    },
  );
});
