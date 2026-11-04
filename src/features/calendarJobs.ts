import type {
  CalendarAnalysisResult,
  CalendarImportResult,
} from "./calendarAssistant";

/** Calendar usage was explicitly approved on this model; never silently fall back. */
export const CALENDAR_MODEL = "gpt-6-luna";
export interface CalendarJobResult {
  status: "processing" | "ready" | "saved" | "failed";
  requestId?: string;
  circleId?: string;
  proposal?: CalendarAnalysisResult;
  error?: string;
  receipt?: CalendarImportResult;
}
