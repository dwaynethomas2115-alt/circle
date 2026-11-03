import { assertCalendarLocalUri } from "./calendarInputValidation";

export async function readCalendarLocalBytes(
  uri: string,
  limit: number,
  selected?: Blob,
): Promise<Uint8Array> {
  assertCalendarLocalUri(uri);
  let blob = selected;
  if (!blob) {
    const response = await fetch(uri, { redirect: "error" });
    if (!response.ok)
      throw new Error("The selected local file could not be read.");
    const announced = Number(response.headers.get("content-length"));
    if (announced > limit)
      throw new Error(
        "This file exceeds the supported calendar attachment limit.",
      );
    blob = await response.blob();
  }
  if (!blob.size || blob.size > limit)
    throw new Error(
      "This file is empty or exceeds the supported calendar attachment limit.",
    );
  return new Uint8Array(await blob.arrayBuffer());
}

export async function discardCalendarPreparedImage(uri: string) {
  if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
}

export async function discardCalendarPickedText(uri: string) {
  if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
}

export async function discardCalendarPickedPhoto(uri: string) {
  if (uri.startsWith("blob:")) URL.revokeObjectURL(uri);
}
