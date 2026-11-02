/**
 * Non-billable, controlled comparison of private-media snapshot I/O.
 * Run: npx --no-install tsx appwrite/benchmarks/media-performance.ts
 * Optional: --baseline-ref=<commit> --output=/tmp/circle-media-performance.json
 *
 * Reads committed baseline source with git show; never checks out or modifies it.
 * Both versions use identical fake database/token services:18 files,20ms per
 * reservation read/token mint,3 runs. All other mocked operations are immediate.
 * This isolates the media waterfall; it does not predict hosted loading latency.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { build, type Plugin } from "esbuild";
import type { MediaServices } from "../function/media";

type Implementation = {
  emptyStore: typeof import("../function/domain").emptyStore;
  records: typeof import("../function/records").records;
  Repository: typeof import("../function/repository").Repository;
  hydrateMedia: typeof import("../function/media").hydrateMedia;
  FakeDatabase: typeof import("../tests/fake-database").FakeDatabase;
};

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baselineDefault = "310061ee71ddb7ade7026ec8e44cc616cd5bde58";
const files = 18;
const simulatedRoundTripMs = 20;
const runsPerVersion = 3;
const who = { $id: "alice", name: "Alice", email: "alice@example.test" };

function git(...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

function atCommit(commit: string): Plugin {
  return {
    name: "committed-circle-benchmark-source",
    setup(builder) {
      builder.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, ({ path }) => {
        if (
          !path.startsWith(root + sep) ||
          path.includes(`${sep}node_modules${sep}`)
        )
          return;
        const pathInGit = relative(root, path).split(sep).join("/");
        return {
          contents: git("show", `${commit}:${pathInGit}`),
          loader: path.endsWith(".tsx")
            ? "tsx"
            : path.endsWith(".ts")
              ? "ts"
              : "js",
        };
      });
    },
  };
}

async function implementation(
  temp: string,
  name: string,
  commit?: string,
): Promise<Implementation> {
  const exported = [
    ["emptyStore", "appwrite/function/domain.ts"],
    ["records", "appwrite/function/records.ts"],
    ["Repository", "appwrite/function/repository.ts"],
    ["hydrateMedia", "appwrite/function/media.ts"],
    ["FakeDatabase", "appwrite/tests/fake-database.ts"],
  ];
  const output = join(temp, `${name}.cjs`);
  await build({
    stdin: {
      contents: exported
        .map(
          ([symbol, path]) =>
            `export { ${symbol} } from ${JSON.stringify(join(root, path))};`,
        )
        .join("\n"),
      resolveDir: root,
      loader: "ts",
    },
    outfile: output,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    packages: "external",
    plugins: commit ? [atCommit(commit)] : [],
    logLevel: "silent",
  });
  return createRequire(import.meta.url)(output) as Implementation;
}

function fixture(impl: Implementation) {
  const store = impl.emptyStore();
  store.uploads = {};
  store.app.currentUserId = who.$id;
  store.app.users.push({
    id: who.$id,
    name: who.name,
    email: who.email,
    username: "alice",
    avatar: "",
    bio: "",
  });
  store.app.circles.push({
    id: "family",
    name: "Family",
    description: "",
    category: "Family",
    avatar: "🌿",
    cover: "",
    color: "#447766",
    discoverable: false,
    approvalRequired: true,
    ownerId: who.$id,
    createdAt: "2026-01-01",
  });
  store.app.members.push({
    circleId: "family",
    userId: who.$id,
    role: "owner",
    joinedAt: "2026-01-01",
  });
  for (let index = 0; index < files; index++) {
    const id = `${index.toString(16).padStart(8, "0")}-1111-4111-8111-111111111111`;
    store.uploads[id] = {
      owner: who.$id,
      ready: true,
      mediaType: "image",
      createdAt: 0,
    };
    store.app.posts.push({
      id: `post-${index}`,
      circleId: "family",
      authorId: who.$id,
      content: "Sample memory",
      media: `awfile:${id}`,
      mediaType: "image",
      createdAt: "2026-01-01",
      reactions: [],
    });
  }
  return store;
}

async function sample(impl: Implementation) {
  const store = fixture(impl);
  const db = new impl.FakeDatabase();
  for (const entity of impl.records(store).values())
    db.seed(entity.table, entity.id, entity.data);
  let activeReads = 0,
    peakReads = 0,
    reads = 0,
    activeTokens = 0,
    peakTokens = 0,
    tokens = 0;
  const latency = () =>
    new Promise<void>((done) => setTimeout(done, simulatedRoundTripMs));
  const api = new Proxy(db.api, {
    get(target, key) {
      if (key === "getRow")
        return async (input: {
          databaseId: string;
          tableId: string;
          rowId: string;
          transactionId?: string;
        }) => {
          if (input.tableId === "uploads") {
            reads++;
            peakReads = Math.max(peakReads, ++activeReads);
            await latency();
            activeReads--;
          }
          return db.api.getRow(input);
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(db) : value;
    },
  });
  const media = {
    tokens: {
      createFileToken: async () => {
        tokens++;
        peakTokens = Math.max(peakTokens, ++activeTokens);
        await latency();
        activeTokens--;
        return { secret: "dummy-short-lived-token" };
      },
    },
  } as unknown as MediaServices;
  const start = performance.now();
  const snapshot = await new impl.Repository(api, "circle").read(who, {
    kind: "snapshot",
  });
  const afterRead = performance.now();
  await impl.hydrateMedia(
    snapshot.data as typeof store.app,
    media,
    snapshot.store,
    "https://appwrite.example.test/v1",
    "circle",
  );
  const end = performance.now();
  return {
    readMs: Math.round(afterRead - start),
    signMs: Math.round(end - afterRead),
    totalMs: Math.round(end - start),
    reads,
    tokens,
    peakReads,
    peakTokens,
  };
}

async function compare(impl: Implementation) {
  const runs = [];
  for (let index = 0; index < runsPerVersion; index++)
    runs.push(await sample(impl));
  return {
    runs,
    medianTotalMs: runs
      .map((run) => run.totalMs)
      .sort((left, right) => left - right)[Math.floor(runs.length / 2)],
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.some(
      (value) =>
        !value.startsWith("--baseline-ref=") && !value.startsWith("--output="),
    )
  )
    throw new Error("Use --baseline-ref=<commit> and/or --output=<path>.");
  const reference =
    args
      .find((value) => value.startsWith("--baseline-ref="))
      ?.slice("--baseline-ref=".length) || baselineDefault;
  const baselineCommit = git(
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${reference}^{commit}`,
  ).trim();
  const temp = mkdtempSync(join(tmpdir(), "circle-media-benchmark-"));
  const priorFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Live network is disabled in this local benchmark.");
  };
  try {
    // Resolve already-installed packages without installing or copying dependencies.
    symlinkSync(
      join(root, "node_modules"),
      join(temp, "node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const baseline = await compare(
      await implementation(temp, "baseline", baselineCommit),
    );
    const current = await compare(await implementation(temp, "current"));
    const report = {
      description: "Controlled local media-I/O benchmark, not hosted latency",
      files,
      simulatedRoundTripMs,
      runsPerVersion,
      baselineCommit,
      currentSource: "working tree",
      baseline,
      current,
      reductionPercent: Math.round(
        (1 - current.medianTotalMs / baseline.medianTotalMs) * 100,
      ),
    };
    const output = args
      .find((value) => value.startsWith("--output="))
      ?.slice("--output=".length);
    if (output) {
      mkdirSync(dirname(resolve(output)), { recursive: true });
      writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    }
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } finally {
    globalThis.fetch = priorFetch;
    rmSync(temp, { recursive: true, force: true });
  }
}

void main().catch((cause) => {
  process.stderr.write(
    `${cause instanceof Error ? cause.message : "Benchmark failed."}\n`,
  );
  process.exitCode = 1;
});
