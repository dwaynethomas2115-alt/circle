import { Platform } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  CALENDAR_LIMITS,
  type CalendarSource,
} from "../features/calendarAssistant";
import {
  assertCalendarTextMetadata,
  calendarFileName,
  calendarImageSource,
  calendarTextSource,
  inspectCalendarOriginalImage,
} from "./calendarInputValidation";
import {
  discardCalendarPickedText,
  discardCalendarPickedPhoto,
  discardCalendarPreparedImage,
  readCalendarLocalBytes,
} from "./calendarInputBytes";

export async function chooseCalendarTextFile(): Promise<CalendarSource | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["text/plain", "text/csv", "application/csv"],
    multiple: false,
    copyToCacheDirectory: true,
    base64: false,
  });
  if (result.canceled) return null;
  if (result.assets.length !== 1)
    throw new Error("Choose one TXT or CSV calendar file at a time.");
  const file = result.assets[0];
  try {
    assertCalendarTextMetadata(file.name, file.mimeType);
    if (file.size !== undefined && file.size > CALENDAR_LIMITS.maxTextBytes)
      throw new Error(
        "Calendar text files must be no larger than 12,000 bytes.",
      );
    const bytes = await readCalendarLocalBytes(
      file.uri,
      CALENDAR_LIMITS.maxTextBytes,
      file.file,
    );
    return calendarTextSource(file.name, file.mimeType, bytes);
  } finally {
    await discardCalendarPickedText(file.uri);
  }
}

export async function chooseCalendarPhoto(): Promise<CalendarSource | null> {
  if (Platform.OS !== "web") {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted)
      throw new Error("Allow photo access to choose a calendar picture.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: false,
    allowsEditing: false,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return null;
  const photo = result.assets[0];
  if (!photo) throw new Error("Choose one calendar photo at a time.");
  try {
    if (result.assets.length !== 1 || photo.type === "video")
      throw new Error("Choose one calendar photo at a time.");
    if (
      (photo.fileSize !== undefined &&
        photo.fileSize > CALENDAR_LIMITS.maxOriginalImageBytes) ||
      photo.width * photo.height > CALENDAR_LIMITS.maxOriginalImagePixels
    )
      throw new Error(
        "Choose a calendar photo up to 10 MiB and 20 megapixels.",
      );
    const bytes = await readCalendarLocalBytes(
      photo.uri,
      CALENDAR_LIMITS.maxOriginalImageBytes,
      photo.file,
    );
    const original = inspectCalendarOriginalImage(
      bytes,
      photo.fileName,
      photo.mimeType,
    );
    const name = calendarFileName(
      photo.fileName ||
        `calendar.${original.mime === "image/png" ? "png" : original.mime === "image/webp" ? "webp" : "jpg"}`,
    );
    const longest = Math.max(original.width, original.height);
    const actions: ImageManipulator.Action[] =
      longest > CALENDAR_LIMITS.maxImageEdge
        ? [
            {
              resize:
                original.width >= original.height
                  ? { width: CALENDAR_LIMITS.maxImageEdge }
                  : { height: CALENDAR_LIMITS.maxImageEdge },
            },
          ]
        : [];
    for (const quality of [0.8, 0.6, 0.4]) {
      const prepared = await ImageManipulator.manipulateAsync(
        photo.uri,
        actions,
        {
          format: ImageManipulator.SaveFormat.JPEG,
          compress: quality,
          base64: true,
        },
      );
      try {
        if (prepared.base64) {
          const decodedSize =
            Math.floor((prepared.base64.length * 3) / 4) -
            (prepared.base64.endsWith("==")
              ? 2
              : prepared.base64.endsWith("=")
                ? 1
                : 0);
          if (decodedSize <= CALENDAR_LIMITS.maxImageBytes)
            return calendarImageSource(name, prepared.base64);
        }
      } finally {
        if (prepared.uri !== photo.uri)
          await discardCalendarPreparedImage(prepared.uri);
      }
    }
    throw new Error(
      "This calendar photo is still too large after preparation. Crop it to one clear section or choose a smaller photo.",
    );
  } finally {
    await discardCalendarPickedPhoto(photo.uri);
  }
}
