import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Image, Platform } from "react-native";
import { openUploadSource } from "./uploadSource";
import {
  CALENDAR_IMAGE_BYTES,
  decodeCalendarText,
  type CalendarInput,
} from "../features/calendar-ai";
export async function pickCalendarAttachment(): Promise<
  CalendarInput["attachment"] | undefined
> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["text/plain", "text/csv", "image/jpeg", "image/png", "image/webp"],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return undefined;
  const asset = result.assets[0];
  const source = await openUploadSource(asset.uri);
  try {
    if (asset.name.length > 180)
      throw new Error("Shorten the file name to 180 characters.");
    if (/\.(txt|csv)$/i.test(asset.name)) {
      if (source.size > 12000)
        throw new Error("TXT/CSV files must be at most 12,000 bytes.");
      return {
        type: "text",
        name: asset.name,
        content: decodeCalendarText(
          new Uint8Array(await source.read(0, source.size)),
          asset.name,
        ),
      };
    }
    if (
      !/\.(jpe?g|png|webp)$/i.test(asset.name) ||
      source.size > 10 * 1024 * 1024
    )
      throw new Error(
        "Choose JPEG, PNG or WebP up to 10 MiB, or UTF-8 TXT/CSV. PDF, Office, ICS and HEIC are unsupported.",
      );
    const signature = new Uint8Array(
      await source.read(0, Math.min(12, source.size)),
    );
    const jpeg =
      signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
      (v, i) => signature[i] === v,
    );
    const webp =
      String.fromCharCode(...signature.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...signature.slice(8, 12)) === "WEBP";
    if (!(jpeg || png || webp))
      throw new Error("The image content must be JPEG, PNG or WebP.");
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        Image.getSize(
          asset.uri,
          (width, height) => resolve({ width, height }),
          reject,
        );
      },
    );
    if (
      !dimensions.width ||
      !dimensions.height ||
      dimensions.width * dimensions.height > 20000000
    )
      throw new Error("Images must be at most 20 megapixels.");
    const scale = Math.min(
      1,
      1024 / Math.max(dimensions.width, dimensions.height),
    );
    const width = Math.max(1, Math.round(dimensions.width * scale)),
      height = Math.max(1, Math.round(dimensions.height * scale));
    let base64 = "";
    if (Platform.OS === "web") {
      const img = new window.Image();
      img.src = asset.uri;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image conversion is unavailable.");
      context.fillStyle = "white";
      context.fillRect(0, 0, width, height);
      context.drawImage(img, 0, 0, width, height);
      for (const quality of [0.8, 0.6, 0.4]) {
        base64 = canvas.toDataURL("image/jpeg", quality).split(",")[1];
        if ((base64.length * 3) / 4 <= CALENDAR_IMAGE_BYTES) break;
      }
    } else {
      const context = ImageManipulator.manipulate(asset.uri);
      context.resize({ width, height });
      const image = await context.renderAsync();
      try {
        for (const compress of [0.8, 0.6, 0.4]) {
          const saved = await image.saveAsync({
            format: SaveFormat.JPEG,
            compress,
            base64: true,
          });
          base64 = saved.base64 || "";
          await FileSystem.deleteAsync(saved.uri, { idempotent: true });
          if ((base64.length * 3) / 4 <= CALENDAR_IMAGE_BYTES) break;
        }
      } finally {
        image.release();
        context.release();
      }
    }
    if (!base64 || (base64.length * 3) / 4 > CALENDAR_IMAGE_BYTES)
      throw new Error(
        "This image is too detailed after resizing. Crop the event information and select it again.",
      );
    return { type: "image", name: asset.name, base64 };
  } finally {
    await source.close?.();
    if (
      Platform.OS !== "web" &&
      FileSystem.cacheDirectory &&
      asset.uri.startsWith(FileSystem.cacheDirectory)
    )
      await FileSystem.deleteAsync(asset.uri, { idempotent: true });
  }
}
