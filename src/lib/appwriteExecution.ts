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

// Keep a timed-out job's ID so retrying the same prompt resumes polling rather
// than starting another paid generation. Entries are scoped to the account.
const pendingThemeJobs = new Map<string, string>();
const terminal = (status: string) =>
  status === "completed" || status === "failed" || status === "canceled";
const pendingError = () =>
  new ThemeGenerationError(202, {
    code: "theme_pending",
    error:
      "Your wallpaper is still processing. Try the same prompt again to check this request; it won’t start another generation.",
  });

export async function runCircleExecution<T>(
  service: ExecutionService,
  options: ExecutionOptions,
): Promise<T> {
  const { functionId, themeJobKey } = options;
  const now = options.now || Date.now;
  const pause =
    options.pause ||
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + (options.timeoutMs ?? 240_000);
  let execution: CircleExecution;
  const existing = themeJobKey && pendingThemeJobs.get(themeJobKey);
  if (existing) {
    execution = {
      $id: existing,
      status: "waiting",
      responseBody: "",
      responseStatusCode: 0,
    };
  } else {
    // SDK credentials are the current user's session. No server API key is used.
    execution = await service.createExecution({
      functionId,
      body: JSON.stringify(options.body),
      async: Boolean(themeJobKey),
    });
    if (themeJobKey && execution.$id)
      pendingThemeJobs.set(themeJobKey, execution.$id);
  }
  if (themeJobKey) {
    if (!execution.$id)
      throw new Error("The wallpaper request did not return an execution ID.");
    while (!terminal(execution.status)) {
      if (now() >= deadline) throw pendingError();
      await pause(1_500);
      if (now() >= deadline) throw pendingError();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        execution = await Promise.race([
          service.getExecution({ functionId, executionId: execution.$id }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(pendingError()),
              Math.max(1, deadline - now()),
            );
          }),
        ]);
      } catch (cause) {
        if (
          cause instanceof ThemeGenerationError &&
          cause.code === "theme_pending"
        )
          throw cause;
        const status = (cause as { code?: number })?.code;
        if (status === 401 || status === 403 || status === 404) {
          if (status === 404) pendingThemeJobs.delete(themeJobKey);
          throw cause;
        }
        // Polling can retry a transient response without executing the Function again.
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    pendingThemeJobs.delete(themeJobKey);
  }
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
    throw new ThemeGenerationError(
      execution.responseStatusCode || 500,
      response,
    );
  return response.data as T;
}
