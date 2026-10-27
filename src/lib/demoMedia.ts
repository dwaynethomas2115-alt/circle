import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import type { AppState } from "../types";
import { mapDemoImages, restoreDemoState } from "../state/persistence";

const PREFIX = "circle-local-media:";
const liveToStored = new Map<string, string>();
const storedToLive = new Map<string, string>();
let database: Promise<IDBDatabase> | undefined;
function db(): Promise<IDBDatabase> {
  if (!database)
    database = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(
          new Error("Local media storage is unavailable in this browser."),
        );
        return;
      }
      const request = indexedDB.open("circle-demo-media", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("attachments");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(
          request.error || new Error("Could not open local media storage."),
        );
    });
  return database;
}
async function operation<T>(
  mode: IDBTransactionMode,
  make: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const connection = await db();
  return new Promise<T>((resolve, reject) => {
    const tx = connection.transaction("attachments", mode);
    const request = make(tx.objectStore("attachments"));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () =>
      reject(
        tx.error || request.error || new Error("Local media storage failed."),
      );
    tx.onabort = () =>
      reject(tx.error || new Error("Local media storage was interrupted."));
  });
}
function nativeDirectory() {
  if (!FileSystem.documentDirectory)
    throw new Error("Local media storage is unavailable on this device.");
  return `${FileSystem.documentDirectory}circle-demo-media/`;
}
function remember(key: string, uri: string) {
  const stored = `${PREFIX}${key}`;
  liveToStored.set(uri, stored);
  storedToLive.set(stored, uri);
  return uri;
}
function mediaKeys(state: AppState) {
  const keys = new Set<string>();
  mapDemoImages(state, (uri) => {
    const key = liveToStored.get(uri) || uri;
    if (key.startsWith(PREFIX)) keys.add(key);
    return uri;
  });
  return keys;
}

/** Copy temporary picker results to durable, device-local demo storage. */
export async function persistDemoMedia(
  uri?: string,
): Promise<string | undefined> {
  if (!uri || liveToStored.has(uri)) return uri;
  const isLocal = /^(?:blob:|data:|file:|content:)/.test(uri);
  if (!isLocal) return uri;
  const extension =
    /\.(jpg|jpeg|png|webp|heic|mp4|mov|m4v)(?:$|[?#])/i
      .exec(uri)?.[1]
      .toLowerCase() || "bin";
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.${extension}`;
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    if (!response.ok)
      throw new Error(
        "The selected file is no longer available. Please choose it again.",
      );
    const blob = await response.blob();
    if (blob.size > 50 * 1024 * 1024)
      throw new Error("Please choose demo media smaller than 50 MB.");
    try {
      await operation("readwrite", (store) => store.put(blob, key));
    } catch {
      throw new Error(
        "Your browser could not save this attachment. Free some device storage or choose a smaller file.",
      );
    }
    return remember(key, URL.createObjectURL(blob));
  }
  const folder = nativeDirectory();
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  const destination = `${folder}${key}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return remember(key, destination);
}

export function serializeDemoMedia(uri: string) {
  return liveToStored.get(uri) || uri;
}

/** Recreate live Blob URLs or native document paths from stable persisted keys. */
export async function hydrateDemoMedia(
  raw: string,
  assets: Record<string, string>,
): Promise<{ state: AppState; missing: boolean }> {
  const candidate = restoreDemoState(raw, assets);
  const keys = mediaKeys(candidate);
  let missing = false;
  const temporary = new Set<string>();
  mapDemoImages(candidate, (uri) => {
    if (
      /^(?:blob:|data:)/.test(uri) ||
      (Platform.OS !== "web" &&
        /^(?:file:|content:)/.test(uri) &&
        !liveToStored.has(uri))
    )
      temporary.add(uri);
    return uri;
  });
  const restored = new Map<string, string>();
  await Promise.all(
    [...keys].map(async (stored) => {
      if (storedToLive.has(stored)) {
        restored.set(stored, storedToLive.get(stored)!);
        return;
      }
      const key = stored.slice(PREFIX.length);
      try {
        if (Platform.OS === "web") {
          const blob = (await operation("readonly", (store) =>
            store.get(key),
          )) as Blob | undefined;
          if (!blob) {
            missing = true;
            restored.set(stored, "");
            return;
          }
          const uri = remember(key, URL.createObjectURL(blob));
          restored.set(stored, uri);
        } else {
          const uri = `${nativeDirectory()}${key}`;
          const info = await FileSystem.getInfoAsync(uri);
          if (!info.exists) {
            missing = true;
            restored.set(stored, "");
            return;
          }
          remember(key, uri);
          restored.set(stored, uri);
        }
      } catch {
        missing = true;
        restored.set(stored, "");
      }
    }),
  );
  await Promise.all(
    [...temporary].map(async (uri) => {
      try {
        restored.set(uri, (await persistDemoMedia(uri)) || "");
      } catch {
        missing = true;
        restored.set(uri, "");
      }
    }),
  );
  return {
    state: mapDemoImages(candidate, (uri) => restored.get(uri) ?? uri),
    missing,
  };
}

async function removeStoredKey(stored: string): Promise<void> {
  const key = stored.slice(PREFIX.length);
  if (Platform.OS === "web")
    await operation("readwrite", (store) => store.delete(key));
  else
    await FileSystem.deleteAsync(`${nativeDirectory()}${key}`, {
      idempotent: true,
    });
  const uri = storedToLive.get(stored);
  if (uri) {
    if (Platform.OS === "web") URL.revokeObjectURL(uri);
    liveToStored.delete(uri);
  }
  storedToLive.delete(stored);
}

/** Remove orphaned local files after content/account deletion or demo reset. */
export async function removeUnusedDemoMedia(
  previous: AppState,
  next: AppState,
): Promise<void> {
  const oldKeys = mediaKeys(previous),
    newKeys = mediaKeys(next);
  await Promise.all(
    [...oldKeys].filter((key) => !newKeys.has(key)).map(removeStoredKey),
  );
}

/** Roll back freshly copied files when validation or state persistence fails. */
export async function discardUncommittedDemoMedia(
  uris: string[],
  state: AppState,
): Promise<void> {
  const referenced = mediaKeys(state);
  const keys = new Set(
    uris
      .map((uri) => liveToStored.get(uri))
      .filter((key): key is string => Boolean(key) && !referenced.has(key!)),
  );
  await Promise.all([...keys].map(removeStoredKey));
}
