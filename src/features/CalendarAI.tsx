import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { randomUUID } from "expo-crypto";
import { Button, Card, Field, T, Banner } from "../ui/primitives";
import {
  calendarInputSchema,
  calendarProposalSchema,
  eventProblem,
  type CalendarEventDraft,
  type CalendarInput,
  type CalendarResult,
} from "./calendar-ai";
import { pickCalendarAttachment } from "../lib/calendarAttachment";
import { invokeCircle } from "../lib/appwrite";
import { useCircle } from "../state/CircleProvider";
type Draft = CalendarEventDraft & { reviewed: boolean; selected: boolean };
export function CalendarAI({
  circleId,
  onSaved,
  call = invokeCircle,
}: {
  circleId: string;
  onSaved: () => void;
  call?: <T>(body: unknown) => Promise<T>;
}) {
  const { user, mode, state, authStatus } = useCircle();
  const allowed =
    authStatus !== "unknown" &&
    !!user &&
    state.members.some((m) => m.circleId === circleId && m.userId === user.id);
  const scope = `${user?.id}:${circleId}:${allowed}`;
  const active = useRef(scope);
  active.current = scope;
  const [text, setText] = useState(""),
    [attachment, setAttachment] = useState<CalendarInput["attachment"]>();
  const [drafts, setDrafts] = useState<Draft[]>([]),
    [warnings, setWarnings] = useState<string[]>([]);
  const [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const [id, setId] = useState<string>();
  const analysis = useRef<{ key: string; id: string } | undefined>(undefined);
  const locked = useRef(false);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  useEffect(() => {
    active.current = scope;
    setBusy(false);
    setText("");
    setAttachment(undefined);
    setDrafts([]);
    setWarnings([]);
    setId(undefined);
    setConfirm(false);
    analysis.current = undefined;
    return () => {
      active.current = "closed";
    };
  }, [scope]);
  function invalidate() {
    setId(undefined);
    setDrafts([]);
    setWarnings([]);
    setConfirm(false);
  }
  function change(index: number, patch: Partial<Draft>) {
    setDrafts((items) =>
      items.map((item, i) =>
        i === index ? { ...item, ...patch, reviewed: false } : item,
      ),
    );
    setConfirm(false);
  }
  async function operation(work: () => Promise<void>) {
    if (locked.current || !allowed) return;
    locked.current = true;
    setBusy(true);
    setNotice("");
    try {
      await work();
    } catch (e) {
      if (active.current === scope)
        setNotice(
          e instanceof Error
            ? e.message
            : "The request could not finish. Retry to check its result.",
        );
    } finally {
      locked.current = false;
      if (active.current === scope) setBusy(false);
    }
  }
  async function analyze() {
    await operation(async () => {
      if (mode !== "appwrite")
        throw new Error(
          "Calendar AI needs a connected Appwrite backend. Local Demo does not send sources or generate events.",
        );
      const parsed = calendarInputSchema.safeParse({
        text,
        timezone: zone,
        ...(attachment ? { attachment } : {}),
      });
      if (!parsed.success)
        throw new Error(
          "Use up to 4,000 characters and one supported attachment, with a valid device timezone.",
        );
      const key = JSON.stringify(parsed.data);
      if (analysis.current?.key !== key)
        analysis.current = { key, id: randomUUID() };
      const requestId = analysis.current.id;
      setConfirm(false);
      const result = await call<CalendarResult>({
        kind: "analyzeCalendar",
        circleId,
        requestId,
        input: parsed.data,
      });
      if (active.current !== scope) return;
      if (result.status === "saved") {
        setNotice("This import was already saved. Refresh the calendar.");
        onSaved();
        return;
      }
      const proposal = calendarProposalSchema.parse(result.proposal);
      setId(requestId);
      setDrafts(
        proposal.events.map((e) => ({ ...e, reviewed: false, selected: true })),
      );
      setWarnings(proposal.warnings);
      setNotice(
        proposal.events.length
          ? "Proposals only. Review every selected event before saving."
          : "No timed events found. Clarify the description and analyze again.",
      );
    });
  }
  const selected = drafts.filter((d) => d.selected);
  const reviewReady =
    !!id &&
    selected.length > 0 &&
    selected.every(
      ({ reviewed, selected: _selected, ...event }) =>
        reviewed && !eventProblem(event),
    );
  async function save() {
    if (!confirm || !reviewReady) return;
    await operation(async () => {
      const result = await call<CalendarResult>({
        kind: "saveCalendar",
        circleId,
        requestId: id,
        confirmed: true,
        events: selected.map(({ selected: _selected, ...event }) => event),
      });
      if (active.current !== scope) return;
      if (result.status !== "saved")
        throw new Error(
          "Save not confirmed. Retry this unchanged batch to check its result.",
        );
      setNotice(
        `Saved ${result.eventIds!.length - (result.skipped || 0)} events. ${result.skipped || 0} duplicates skipped.`,
      );
      setDrafts([]);
      setId(undefined);
      setConfirm(false);
      setText("");
      setAttachment(undefined);
      analysis.current = undefined;
      onSaved();
    });
  }
  if (!allowed) return null;
  return (
    <Card>
      <View style={{ gap: 12 }}>
        <T style={{ fontSize: 19 }}>Plan with AI</T>
        <T>
          Describe plans or attach one file. Nothing is saved until you review
          each event and confirm the batch.
        </T>
        <T>
          Timezone: {zone || "Set a valid device timezone"}. Missing or
          ambiguous times need clarification.
        </T>
        <Field
          label="Describe or clarify your plans"
          value={text}
          multiline
          maxLength={4000}
          editable={!busy}
          onChangeText={(value) => {
            setText(value);
            invalidate();
          }}
          placeholder="Include the date, start and end time. Add clarifications here, then analyze again."
        />
        <T>
          {text.length}/4,000 characters · TXT/CSV ≤12,000 bytes · JPEG/PNG/WebP
          ≤10 MiB and 20 MP. No PDF, Office, ICS, HEIC, recurring or all-day
          events.
        </T>
        <T>
          Analysis sends this description and attachment to OpenAI. Source
          attachments are not saved to your Circle.
        </T>
        <Button
          secondary
          disabled={busy}
          onPress={() =>
            void operation(async () => {
              const next = await pickCalendarAttachment();
              if (active.current === scope && next) {
                setAttachment(next);
                invalidate();
              }
            })
          }
        >
          Choose calendar attachment
        </Button>
        {attachment && (
          <>
            <T>Attached: {attachment.name}</T>
            <Button
              secondary
              disabled={busy}
              onPress={() => {
                setAttachment(undefined);
                invalidate();
              }}
            >
              Remove attachment
            </Button>
          </>
        )}
        <Button disabled={busy} onPress={() => void analyze()}>
          {busy ? "Working…" : "Analyze plans"}
        </Button>
        {notice ? <Banner text={notice} /> : null}
        {!busy && !id && analysis.current && (
          <Button
            secondary
            onPress={() => {
              analysis.current = undefined;
              setNotice(
                "The next analysis will be a new request and may incur another charge. A previous pending request may still finish.",
              );
            }}
          >
            Use a new analysis request
          </Button>
        )}
        {warnings.map((warning, i) => (
          <T key={i}>Clarification: {warning}</T>
        ))}
        {drafts.map((draft, i) => {
          const { reviewed, selected: included, ...event } = draft;
          const problem = eventProblem(event);
          return (
            <Card key={i}>
              <View style={{ gap: 10 }}>
                <T style={{ fontSize: 17 }}>
                  Proposal {i + 1}
                  {included ? "" : " (excluded)"}
                </T>
                <Button
                  secondary
                  disabled={busy}
                  onPress={() => change(i, { selected: !included })}
                >
                  {included
                    ? `Exclude event ${i + 1}`
                    : `Include event ${i + 1}`}
                </Button>
                {(
                  [
                    ["title", "Title", 120],
                    ["description", "Description", 500],
                    ["location", "Location", 200],
                    ["startsAt", "Start (ISO date, time and offset)", 40],
                    ["endsAt", "End (ISO date, time and offset)", 40],
                  ] as const
                ).map(([key, label, max]) => (
                  <Field
                    key={key}
                    label={`${label} ${i + 1}`}
                    value={draft[key]}
                    maxLength={max}
                    editable={!busy}
                    onChangeText={(value) => change(i, { [key]: value })}
                  />
                ))}
                {draft.warnings.map((warning, j) => (
                  <T key={j}>Check: {warning}</T>
                ))}
                {problem ? (
                  <T>{problem}</T>
                ) : (
                  <T>
                    {new Date(draft.startsAt).toLocaleString()} –{" "}
                    {new Date(draft.endsAt).toLocaleString()} ({zone})
                  </T>
                )}
                <Button
                  secondary
                  disabled={busy || !!problem || !included}
                  onPress={() => {
                    setDrafts((items) =>
                      items.map((item, j) =>
                        j === i ? { ...item, reviewed: !item.reviewed } : item,
                      ),
                    );
                    setConfirm(false);
                  }}
                >
                  {reviewed
                    ? `Event ${i + 1} reviewed`
                    : `I reviewed event ${i + 1} and its warnings`}
                </Button>
              </View>
            </Card>
          );
        })}
        {drafts.length > 0 && (
          <Button
            disabled={busy || !reviewReady}
            onPress={() => setConfirm(true)}
          >
            Review final batch ({selected.length})
          </Button>
        )}
        {confirm && (
          <Card>
            <T>
              Confirm {selected.length} reviewed events for this Circle.
              Existing matching events will be skipped.
            </T>
            {selected.map((e, i) => (
              <T key={i}>
                {e.title} · {new Date(e.startsAt).toLocaleString()} –{" "}
                {new Date(e.endsAt).toLocaleString()} · {e.location}
              </T>
            ))}
            <Button disabled={busy || !reviewReady} onPress={() => void save()}>
              Confirm and save {selected.length} events
            </Button>
            <Button secondary disabled={busy} onPress={() => setConfirm(false)}>
              Back to editing
            </Button>
          </Card>
        )}
      </View>
    </Card>
  );
}
