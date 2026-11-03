import { z } from "zod";
export const CALENDAR_MODEL = "gpt-6-luna";
export const CALENDAR_IMAGE_BYTES = 192 * 1024;
export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().max(500),
    location: z.string().max(200),
    startsAt: z.string().max(40),
    endsAt: z.string().max(40),
    warnings: z.array(z.string().max(240)).max(5),
  })
  .strict();
export const calendarProposalSchema = z
  .object({
    events: z.array(calendarEventSchema).max(20),
    warnings: z.array(z.string().max(240)).max(10),
  })
  .strict();
export type CalendarEventDraft = z.infer<typeof calendarEventSchema>;
export type CalendarProposal = z.infer<typeof calendarProposalSchema>;
export const calendarInputSchema = z
  .object({
    text: z.string().max(4000),
    timezone: z
      .string()
      .max(100)
      .refine(validTimezone, "Choose a valid timezone."),
    attachment: z
      .discriminatedUnion("type", [
        z
          .object({
            type: z.literal("text"),
            name: z
              .string()
              .max(180)
              .regex(/\.(txt|csv)$/i),
            content: z
              .string()
              .refine(
                (s) =>
                  new TextEncoder().encode(s).length <= 12000 &&
                  !s.includes("\0"),
              ),
          })
          .strict(),
        z
          .object({
            type: z.literal("image"),
            name: z.string().max(180),
            base64: z
              .string()
              .max(262144)
              .regex(/^[A-Za-z0-9+/]+={0,2}$/),
          })
          .strict(),
      ])
      .optional(),
  })
  .strict()
  .refine(
    (v) => !!v.text.trim() || !!v.attachment,
    "Describe an event or attach a supported file.",
  );
export type CalendarInput = z.infer<typeof calendarInputSchema>;
export function validTimezone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
// An explicit offset is required. Bare dates and guessed device-zone parsing never reach storage.
export function eventProblem(
  event: CalendarEventDraft,
  now = Date.now(),
): string | null {
  if (!calendarEventSchema.safeParse(event).success)
    return "Check the event fields and their lengths.";
  if (
    ![event.startsAt, event.endsAt].every((s) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        s,
      ),
    )
  )
    return "Enter full start and end dates with timezone offsets.";
  for (const value of [event.startsAt, event.endsAt]) {
    const [year, month, day, hour, minute] = value
      .slice(0, 16)
      .split(/[-T:]/)
      .map(Number);
    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
      hour > 23 ||
      minute > 59
    )
      return "Use valid calendar dates and times.";
  }
  const start = Date.parse(event.startsAt),
    end = Date.parse(event.endsAt);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start <= now ||
    end <= start
  )
    return "Choose a future start and an end after the start.";
  return null;
}
export function eventFingerprint(
  e: Pick<CalendarEventDraft, "title" | "startsAt" | "endsAt" | "location">,
) {
  return JSON.stringify([
    e.title.trim().toLocaleLowerCase(),
    Date.parse(e.startsAt),
    Date.parse(e.endsAt),
    e.location.trim().toLocaleLowerCase(),
  ]);
}
export function decodeCalendarText(bytes: Uint8Array, name: string): string {
  if (!/\.(txt|csv)$/i.test(name) || bytes.byteLength > 12000)
    throw new Error("Choose a UTF-8 TXT or CSV file up to 12,000 bytes.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("The text file must use UTF-8 encoding.");
  }
  if (text.includes("\0")) throw new Error("Binary files are not supported.");
  return text;
}
export type CalendarResult = {
  status: "processing" | "failed" | "ready" | "saved";
  proposal?: CalendarProposal;
  error?: string;
  eventIds?: string[];
  skipped?: number;
};
