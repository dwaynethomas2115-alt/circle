import { ThemeGenerationError } from "../features/theme-errors";

export interface CircleExecution {
  $id: string;
  status: string;
  responseBody: string;
  responseStatusCode: number;
}
interface ExecutionService {
  createExecution(input: {
    functionId: string;
    body: string;
    async: boolean;
  }): Promise<CircleExecution>;
  getExecution(input: {
    functionId: string;
    executionId: string;
  }): Promise<CircleExecution>;
}
interface ExecutionOptions {
  functionId: string;
  body: unknown;
  themeJobKey?: string;
  now?: () => number;
  pause?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
}
interface PendingThemeJob {
  requestId: string;
  dispatch: "new" | "submitted" | "uncertain";
  executionId?: string;
  executionStatus?: string;
  executionStatusCode?: number;
}
type ThemeResult<T> =
  | { status: "pending" }
  | { status: "completed"; theme: T }
  | {
      status: "failed";
      error: string;
      code: string;
      responseStatus: number;
      retryAfterSeconds?: number;
      resetAt?: string;
    };

// A request ID is a server reservation, not an execution response. Keep it when
// a read/connection times out so retrying the prompt resumes the same work.
// The caller scopes these keys to endpoint, project, Function and signed-in user.
const pendingThemeJobs = new Map<string, PendingThemeJob>();
const activeThemeRequests = new Map<string, Promise<unknown>>();
const pendingError = () =>
  new ThemeGenerationError(202, {
    code: "theme_pending",
    error:
      "Your wallpaper is still processing. Try the same prompt again to check this request; it won’t start another generation.",
  });
const deploymentError = () =>
  new Error(
    "The wallpaper server needs an update. Deploy the latest Circle Appwrite Function with main.js as its entrypoint and a 180-second timeout, then try again. Your current theme is unchanged.",
  );
class ExecutionResponseError extends ThemeGenerationError {
  constructor(
    readonly status: number,
    response: unknown,
  ) {
    super(status, response);
  }
}
function parseExecution<T>(execution: CircleExecution): T {
  if (execution.status !== "completed")
    throw new Error(
      "Circle’s Appwrite Function could not finish the request. Check its deployment and timeout setting.",
    );
  let response: {
    data?: T;
    error?: unknown;
    code?: unknown;
    retryAfterSeconds?: unknown;
    resetAt?: unknown;
  };
  try {
    response = JSON.parse(execution.responseBody);
    if (
      !response ||
      typeof response !== "object" ||
      Array.isArray(response) ||
      (!Object.hasOwn(response, "data") && !Object.hasOwn(response, "error"))
    )
      throw new Error();
  } catch {
    throw new Error(
      "Circle’s Appwrite Function did not return a valid response. Check its deployment.",
    );
  }
  if (execution.responseStatusCode >= 400 || response.error)
    throw new ExecutionResponseError(
      execution.responseStatusCode || 500,
      response,
    );
  return response.data as T;
}
function errorStatus(cause: unknown): number | undefined {
  if (cause instanceof ExecutionResponseError) return cause.status;
  const code = (cause as { code?: unknown })?.code;
  return typeof code === "number" ? code : undefined;
}

export async function runCircleExecution<T>(
  service: ExecutionService,
  options: ExecutionOptions,
): Promise<T> {
  if (!options.themeJobKey) {
    // Ordinary requests are synchronous: their response body is available.
    return parseExecution<T>(
      await service.createExecution({
        functionId: options.functionId,
        body: JSON.stringify(options.body),
        async: false,
      }),
    );
  }
  const key = options.themeJobKey;
  const running = activeThemeRequests.get(key);
  if (running) return running as Promise<T>;
  const request = runThemeExecution<T>(service, options, key);
  activeThemeRequests.set(key, request);
  try {
    return await request;
  } finally {
    if (activeThemeRequests.get(key) === request)
      activeThemeRequests.delete(key);
  }
}

async function runThemeExecution<T>(
  service: ExecutionService,
  options: ExecutionOptions,
  key: string,
): Promise<T> {
  const { functionId } = options;
  const body = options.body as { circleId?: unknown; prompt?: unknown } | null;
  if (
    !body ||
    typeof body.circleId !== "string" ||
    typeof body.prompt !== "string"
  )
    throw new Error("Choose a Circle and describe the wallpaper to generate.");
  const { circleId, prompt } = body;
  const now = options.now || Date.now;
  const pause =
    options.pause ||
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + (options.timeoutMs ?? 240_000);
  const bounded = async <V>(operation: () => Promise<V>): Promise<V> => {
    if (now() >= deadline) throw pendingError();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(pendingError()),
            Math.max(1, deadline - now()),
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const call = async <V>(request: unknown): Promise<V> =>
    parseExecution<V>(
      await bounded(() =>
        service.createExecution({
          functionId,
          body: JSON.stringify(request),
          async: false,
        }),
      ),
    );
  let job = pendingThemeJobs.get(key);
  if (!job) {
    let prepared: { requestId?: unknown } | undefined;
    try {
      // A synchronous preflight reserves a job before dispatch. Business errors
      // and old Function versions are visible before any chargeable work starts.
      prepared = await call({ kind: "prepareTheme", circleId, prompt });
    } catch (cause) {
      if (
        cause instanceof ExecutionResponseError &&
        cause.status === 400 &&
        /invalid.*request|request.*invalid/i.test(cause.message)
      )
        throw deploymentError();
      throw cause;
    }
    if (
      !prepared ||
      typeof prepared.requestId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        prepared.requestId,
      )
    )
      throw deploymentError();
    job = { requestId: prepared.requestId, dispatch: "new" };
    pendingThemeJobs.set(key, job);
  }
  if (job.dispatch !== "submitted") {
    // A lost dispatch response can be retried with this exact reservation ID.
    // The server claims it transactionally and never generates it twice.
    job.dispatch = "uncertain";
    try {
      const execution = await bounded(() =>
        service.createExecution({
          functionId,
          body: JSON.stringify({
            kind: "generateTheme",
            circleId,
            prompt,
            requestId: job.requestId,
          }),
          async: true,
        }),
      );
      if (!execution.$id) throw deploymentError();
      job.executionId = execution.$id;
      job.executionStatus = execution.status;
      job.executionStatusCode = execution.responseStatusCode;
      job.dispatch = "submitted";
      // Appwrite intentionally omits async responseBody, including completed
      // executions. Only the authenticated result endpoint can supply a result.
    } catch (cause) {
      if (
        cause instanceof ThemeGenerationError &&
        cause.code === "theme_pending"
      )
        throw cause;
      if ([401, 403, 404].includes(errorStatus(cause) || 0)) throw cause;
      // The worker may have been queued before its response was lost. Read the
      // saved status; do not submit another generation during this attempt.
    }
  }
  let reads = 0,
    stoppedWorker = false;
  while (now() < deadline) {
    let terminalFailure = false;
    try {
      const result = await call<ThemeResult<T>>({
        kind: "themeResult",
        circleId,
        requestId: job.requestId,
      });
      if (!result || typeof result !== "object") throw deploymentError();
      if (result.status === "completed") {
        if (
          !result.theme ||
          typeof result.theme !== "object" ||
          Array.isArray(result.theme)
        )
          throw deploymentError();
        pendingThemeJobs.delete(key);
        return result.theme;
      }
      if (result.status === "failed") {
        if (
          typeof result.error !== "string" ||
          typeof result.code !== "string" ||
          !Number.isInteger(result.responseStatus) ||
          result.responseStatus < 400 ||
          result.responseStatus > 599
        )
          throw deploymentError();
        pendingThemeJobs.delete(key);
        terminalFailure = true;
        throw new ExecutionResponseError(result.responseStatus, result);
      }
      if (result.status !== "pending") throw deploymentError();
      if (stoppedWorker)
        throw new Error(
          "The wallpaper job stopped before saving its result. Check the Appwrite Function deployment and its 180-second timeout, then retry the same prompt to resume this request. Your current theme is unchanged.",
        );
      reads++;
      // Execution status is only a liveness hint. Never read its responseBody.
      if (
        job.executionId &&
        (reads % 8 === 0 ||
          job.executionStatus === "failed" ||
          job.executionStatus === "canceled" ||
          (job.executionStatus === "completed" &&
            (job.executionStatusCode || 0) >= 400))
      ) {
        const executionId = job.executionId;
        try {
          const execution = await bounded(() =>
            service.getExecution({ functionId, executionId }),
          );
          job.executionStatus = execution.status;
          job.executionStatusCode = execution.responseStatusCode;
        } catch (cause) {
          if (
            cause instanceof ThemeGenerationError &&
            cause.code === "theme_pending"
          )
            throw cause;
          // Saved-result reads still work if execution history is unavailable.
        }
        if (
          job.executionStatus === "failed" ||
          job.executionStatus === "canceled" ||
          (job.executionStatus === "completed" &&
            (job.executionStatusCode || 0) >= 400)
        ) {
          // A worker may stop before its guarded claim. An explicit retry can
          // dispatch the same reservation safely; never reserve a fresh job here.
          job.dispatch = "uncertain";
          // The first result read can race the worker's final commit. Read once
          // more before a generic error so a saved provider failure takes priority.
          stoppedWorker = true;
          continue;
        }
      }
    } catch (cause) {
      if (cause instanceof ThemeGenerationError) {
        if (cause.code === "theme_request_unavailable")
          pendingThemeJobs.delete(key);
        if (
          terminalFailure ||
          cause.code === "theme_pending" ||
          !(cause instanceof ExecutionResponseError) ||
          (cause.status < 500 && cause.status !== 409 && cause.status !== 429)
        )
          throw cause;
      }
      const status = errorStatus(cause);
      if (status && status < 500 && status !== 409 && status !== 429)
        throw cause;
      // Retry only network/temporary result-read failures. Programming/deployment
      // errors have no numeric status and must remain visible.
      if (
        cause instanceof Error &&
        /wallpaper server needs|wallpaper job stopped|did not return a valid response|could not finish the request/.test(
          cause.message,
        )
      )
        throw cause;
    }
    if (now() >= deadline) throw pendingError();
    await bounded(() => pause(1_500));
  }
  throw pendingError();
}
