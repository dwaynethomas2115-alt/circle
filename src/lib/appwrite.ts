import {
  Account,
  Client,
  Functions,
  ID,
  configurePlatform,
} from "./appwriteSdk";

const endpoint = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT;
const project = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID;
const functionId = process.env.EXPO_PUBLIC_APPWRITE_FUNCTION_ID;
const selected = process.env.EXPO_PUBLIC_BACKEND;
// Partial configuration must fail visibly, never silently fall back to demo.
export const isAppwriteEnabled =
  Boolean(selected && selected !== "demo") ||
  Boolean(endpoint || project || functionId);
export function configurationError(): string | null {
  if (selected && !["demo", "appwrite"].includes(selected))
    return "EXPO_PUBLIC_BACKEND must be demo or appwrite.";
  if (!endpoint || !project || !functionId)
    return "Set the Appwrite endpoint, project ID and Circle function ID, then restart Expo.";
  try {
    if (new URL(endpoint).protocol !== "https:")
      return "Use an HTTPS Appwrite endpoint.";
  } catch {
    return "The Appwrite endpoint is invalid.";
  }
  return null;
}
export const client = configurePlatform(new Client());
if (endpoint) client.setEndpoint(endpoint);
if (project) client.setProject(project);
export const account = new Account(client);
const functions = new Functions(client);
export { ID };
export async function currentAccount() {
  const problem = configurationError();
  if (problem) throw new Error(problem);
  try {
    return await account.get();
  } catch (error) {
    if ((error as { code?: number }).code === 401) return null;
    throw error;
  }
}
export async function invokeCircle<T>(body: unknown): Promise<T> {
  const problem = configurationError();
  if (problem) throw new Error(problem);
  const execution = await functions.createExecution({
    functionId: functionId!,
    body: JSON.stringify(body),
    async: false,
  });
  let response: { data?: T; error?: string };
  try {
    response = JSON.parse(execution.responseBody);
  } catch {
    throw new Error(
      "Circle's Appwrite Function did not return a valid response. Check its deployment.",
    );
  }
  if (
    execution.status !== "completed" ||
    execution.responseStatusCode >= 400 ||
    response.error
  )
    throw new Error(
      response.error || "The Appwrite request failed. Please try again.",
    );
  return response.data as T;
}
