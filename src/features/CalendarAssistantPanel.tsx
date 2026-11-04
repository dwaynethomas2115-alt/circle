import React, { useEffect, useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Camera, Check, FileText, Sparkles, X } from "lucide-react-native";
import { useCircle } from "../state/CircleProvider";
import { Banner, Button, Card, Field, IconButton, T } from "../ui/primitives";
import { colors, font } from "../ui/theme";
import {
  chooseCalendarPhoto,
  chooseCalendarTextFile,
} from "../lib/calendarInput";
import { useCircleFeatures } from "./CircleFeaturesProvider";
import { useCircleTheme, themeTint } from "./theme-context";
import {
  CALENDAR_LIMITS,
  proposalToEvent,
  resolveCalendarDateTime,
  validateCalendarAnalysisInput,
  validateCalendarAnalysisResult,
  validateCalendarImportInput,
  validateCalendarSource,
  type CalendarImportEvent,
  type CalendarMessage,
  type CalendarProposal,
  type CalendarSource,
} from "./calendarAssistant";

interface ProposalRow {
  proposal: CalendarProposal;
  included: boolean;
  reviewed: boolean;
  expanded: boolean;
}

function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function localZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}
function Checkbox({
  label,
  children,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  children: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  const theme = useCircleTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onChange}
      style={({ pressed }) => [
        s.checkbox,
        { opacity: disabled ? 0.45 : pressed ? 0.7 : 1 },
      ]}
    >
      <View
        style={[
          s.tick,
          {
            borderColor: checked ? theme.accent : colors.muted,
            backgroundColor: checked ? theme.accent : "transparent",
          },
        ]}
      >
        {checked && <Check size={14} color="white" />}
      </View>
      <T style={{ flex: 1, fontSize: 12, lineHeight: 19 }}>{children}</T>
    </Pressable>
  );
}

/** Nothing from this private, transient chat survives an account/access change. */
export function CalendarAssistant({
  circleId,
  onClose,
}: {
  circleId: string;
  onClose: () => void;
}) {
  const { user, state, mode, authStatus } = useCircle();
  const member = state.members.find(
    (item) => item.circleId === circleId && item.userId === user?.id,
  );
  if (
    !user ||
    !member ||
    (mode === "appwrite" && authStatus !== "authenticated")
  )
    return null;
  const scope = `${mode}:${authStatus || mode}:${user.id}:${circleId}:${member.role}`;
  return (
    <CalendarAssistantSession
      key={scope}
      circleId={circleId}
      scope={scope}
      onClose={onClose}
    />
  );
}

function CalendarAssistantSession({
  circleId,
  scope,
  onClose,
}: {
  circleId: string;
  scope: string;
  onClose: () => void;
}) {
  const theme = useCircleTheme();
  const { state, user, mode, authStatus } = useCircle();
  const { actions } = useCircleFeatures();
  const circle = state.circles.find((item) => item.id === circleId);
  const member = state.members.find(
    (item) => item.circleId === circleId && item.userId === user?.id,
  );
  const liveScope = useRef(scope);
  liveScope.current =
    user && member && (mode !== "appwrite" || authStatus === "authenticated")
      ? `${mode}:${authStatus || mode}:${user.id}:${circleId}:${member.role}`
      : "";
  const mounted = useRef(true);
  const sequence = useRef(0);
  const operation = useRef<number | null>(null);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<CalendarMessage[]>([]);
  const [source, setSource] = useState<CalendarSource>();
  const [referenceDate, setReferenceDate] = useState(localDate);
  const [timeZone, setTimeZone] = useState(localZone);
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"file" | "analysis" | "save" | null>(null);
  const analysis = useRef<{ key: string; id: string } | null>(null);
  const [analysisRequestId, setAnalysisRequestId] = useState<string | null>(
    null,
  );
  const [analysisTerminal, setAnalysisTerminal] = useState(false);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [confirmation, setConfirmation] = useState<
    CalendarImportEvent[] | null
  >(null);
  const confirmationRef = useRef(confirmation);
  confirmationRef.current = confirmation;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current = null;
      analysis.current = null;
    };
  }, []);
  function allowed() {
    return mounted.current && liveScope.current === scope;
  }
  function start(kind: "file" | "analysis" | "save") {
    if (!allowed() || operation.current !== null) return null;
    const id = ++sequence.current;
    operation.current = id;
    setBusy(kind);
    setNotice("");
    return id;
  }
  function current(id: number) {
    return allowed() && operation.current === id;
  }
  function finish(id: number) {
    if (!current(id)) return;
    operation.current = null;
    setBusy(null);
  }
  function invalidateReview() {
    setConfirmation(null);
    setRows((previous) => previous.map((row) => ({ ...row, reviewed: false })));
  }
  function invalidateAnalysisInput() {
    analysis.current = null;
    setAnalysisRequestId(null);
    setAnalysisTerminal(false);
    setAnalysisPending(false);
    invalidateReview();
    if (rows.length)
      setNotice(
        "Your analysis input changed. Choose Propose events again before saving these proposals.",
      );
  }
  function clearSourceAnalysis() {
    analysis.current = null;
    setAnalysisRequestId(null);
    setAnalysisTerminal(false);
    setAnalysisPending(false);
    setRows([]);
    setQuestions([]);
    setHistory([]);
    setConfirmation(null);
    setNotice(
      `${rows.length || questions.length || history.length ? "Previous analysis cleared. " : ""}Choose Propose events to analyze the current message and attachment.`,
    );
  }
  async function attach(kind: "text" | "image") {
    const id = start("file");
    if (id === null) return;
    try {
      const selected = await (kind === "text"
        ? chooseCalendarTextFile()
        : chooseCalendarPhoto());
      if (!current(id) || !selected) return;
      const problem = validateCalendarSource(selected);
      if (problem) throw new Error(problem);
      setSource(selected);
      clearSourceAnalysis();
    } catch (cause) {
      if (current(id))
        setNotice(
          cause instanceof Error
            ? cause.message
            : "That attachment could not be opened. Try another supported file.",
        );
    } finally {
      finish(id);
    }
  }
  async function analyze() {
    const input = {
      circleId,
      message: message.trim(),
      history,
      source,
      referenceDate,
      timeZone: timeZone.trim() || null,
    };
    const problem = validateCalendarAnalysisInput(input);
    if (problem) {
      setNotice(problem);
      return;
    }
    if (analysisTerminal) return;
    const id = start("analysis");
    if (id === null) return;
    const key = JSON.stringify(input);
    if (analysis.current?.key !== key)
      analysis.current = { key, id: randomUUID() };
    const requestId = analysis.current.id;
    setAnalysisRequestId(null);
    invalidateReview();
    try {
      const result = await actions.analyzeCalendar(input, requestId);
      if (!current(id)) return;
      if (!validateCalendarAnalysisResult(result))
        throw new Error(
          "The calendar assistant returned an invalid proposal. Nothing was saved.",
        );
      setAnalysisRequestId(requestId);
      setAnalysisPending(false);
      setAnalysisTerminal(false);
      const reply = [result.reply, ...result.questions].join("\n");
      setHistory((previous) =>
        [
          ...previous,
          {
            role: "user" as const,
            content:
              input.message || `Read attachment: ${source?.name || "calendar"}`,
          },
          { role: "assistant" as const, content: reply },
        ]
          .slice(-CALENDAR_LIMITS.maxHistoryMessages)
          .map((item) => ({
            ...item,
            content: item.content.slice(
              0,
              CALENDAR_LIMITS.maxHistoryMessageChars,
            ),
          })),
      );
      setMessage("");
      setQuestions(result.questions);
      setRows(
        result.proposals.map((proposal, index) => ({
          proposal,
          included: true,
          reviewed: false,
          expanded: index === 0,
        })),
      );
      if (!result.proposals.length && !result.questions.length)
        setNotice(
          "No events were found. Add clearer dates, times, and a timezone, or try a clearer photo.",
        );
    } catch (cause) {
      if (current(id)) {
        const code = (cause as { code?: unknown } | null)?.code;
        setAnalysisTerminal(code === "calendar_terminal");
        setAnalysisPending(code === "calendar_pending");
        setNotice(
          cause instanceof Error
            ? cause.message
            : "Calendar analysis could not be confirmed. Check this unchanged request before starting a new analysis.",
        );
      }
    } finally {
      finish(id);
    }
  }
  function edit(index: number, patch: Partial<CalendarProposal>) {
    if (busy) return;
    setConfirmation(null);
    setRows((previous) =>
      previous.map((row, i) => {
        if (i !== index) return row;
        const resetStart =
          Object.hasOwn(patch, "startDate") ||
          Object.hasOwn(patch, "startTime") ||
          Object.hasOwn(patch, "timeZone");
        const resetEnd =
          Object.hasOwn(patch, "endDate") ||
          Object.hasOwn(patch, "endTime") ||
          Object.hasOwn(patch, "timeZone");
        return {
          ...row,
          reviewed: false,
          proposal: {
            ...row.proposal,
            ...(resetStart ? { startOffset: null } : {}),
            ...(resetEnd ? { endOffset: null } : {}),
            ...patch,
          },
        };
      }),
    );
  }
  const included = rows.filter((row) => row.included);
  const ready =
    !!analysisRequestId &&
    included.length > 0 &&
    included.every(
      (row) => row.reviewed && !!proposalToEvent(row.proposal).event,
    );
  function review() {
    if (busy || !allowed() || !ready) return;
    const events = included.map((row) => proposalToEvent(row.proposal).event!);
    const problem = validateCalendarImportInput({
      circleId,
      confirmed: true,
      events,
    });
    if (problem) {
      setNotice(problem);
      return;
    }
    setConfirmation(events);
  }
  async function save() {
    const events = confirmationRef.current;
    const requestId = analysisRequestId;
    if (!requestId || !events?.length || !allowed()) return;
    // Revalidate current selections, rather than accepting a stale open dialog.
    const includedNow = rowsRef.current.filter((row) => row.included);
    const resolved = includedNow.map((row) => proposalToEvent(row.proposal));
    if (
      includedNow.length !== events.length ||
      includedNow.some((row) => !row.reviewed) ||
      resolved.some((item) => !item.event) ||
      JSON.stringify(resolved.map((item) => item.event)) !==
        JSON.stringify(events)
    ) {
      setConfirmation(null);
      setNotice("The proposals changed. Review them again before saving.");
      return;
    }
    const problem = validateCalendarImportInput({
      circleId,
      confirmed: true,
      events,
    });
    if (problem) {
      setConfirmation(null);
      setNotice(problem);
      return;
    }
    const id = start("save");
    if (id === null) return;
    try {
      const result = await actions.importCalendar(
        {
          circleId,
          confirmed: true,
          events,
        },
        requestId,
      );
      if (!current(id)) return;
      setConfirmation(null);
      if (!result.ok) {
        setNotice(
          result.error ||
            "The import could not be confirmed. Your reviewed proposals are still here; retry after checking the calendar.",
        );
        return;
      }
      setRows([]);
      setQuestions([]);
      setAnalysisRequestId(null);
      analysis.current = null;
      setAnalysisTerminal(false);
      setAnalysisPending(false);
      setNotice(
        `${result.created || 0} ${(result.created || 0) === 1 ? "event added" : "events added"}. ${result.skipped || 0} already on this Circle’s calendar.`,
      );
    } catch {
      if (current(id)) {
        setConfirmation(null);
        setNotice(
          "The save response was not confirmed. Check the calendar, then retry the same reviewed proposals if needed; matching events will be skipped.",
        );
      }
    } finally {
      finish(id);
    }
  }
  return (
    <View testID="calendar-assistant">
      <Card style={{ padding: 18, gap: 14 }}>
        <View style={s.heading}>
          <Sparkles size={20} color={theme.accent} />
          <T
            accessibilityRole="header"
            style={{ fontFamily: font.heading, fontSize: 20, flex: 1 }}
          >
            Calendar AI
          </T>
          <Button secondary disabled={!!busy} onPress={onClose}>
            Close
          </Button>
        </View>
        <T style={s.description}>
          Your calendar conversation, selected attachment, reference date and
          timezone are sent to OpenAI only when you choose Propose events.
          Calendar analysis uses gpt-6-luna with no alternate-model fallback.
          Each new analysis may incur usage charges. Nothing is added until you
          review and confirm.
        </T>
        <T style={s.description}>
          TXT/CSV: UTF-8, up to 12,000 bytes. JPEG/PNG/WebP photos: up to 10 MiB
          and 20 megapixels, prepared as JPEG up to 1,600 pixels per side and
          120 KiB. Up to 20 event proposals; check the source count and split
          larger calendars. PDF, Office, ICS, HEIC, GIF, SVG, recurring and
          all-day events aren’t supported yet.
        </T>
        <View style={s.fields}>
          <View style={s.fieldColumn}>
            <Field
              label="Reference date"
              placeholder="YYYY-MM-DD"
              value={referenceDate}
              onChangeText={(value) => {
                setReferenceDate(value);
                invalidateAnalysisInput();
              }}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10}
            />
          </View>
          <View style={s.fieldColumn}>
            <Field
              label="Calendar timezone"
              placeholder="America/Chicago"
              value={timeZone}
              onChangeText={(value) => {
                setTimeZone(value);
                invalidateAnalysisInput();
              }}
              editable={!busy}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={100}
            />
          </View>
        </View>
        <T style={s.description}>
          Check the timezone above. “Today” and relative dates use the reference
          date. Missing years, unclear times and clock changes need your
          clarification.
        </T>
        {!!history.length && (
          <View testID="calendar-chat-history" style={{ gap: 8 }}>
            {history.map((item, index) => (
              <View
                key={index}
                style={[
                  s.message,
                  {
                    alignSelf: item.role === "user" ? "flex-end" : "flex-start",
                    backgroundColor:
                      item.role === "user"
                        ? themeTint(theme.accent)
                        : theme.background,
                  },
                ]}
              >
                <T
                  style={{
                    fontFamily: font.bold,
                    fontSize: 10,
                    color: colors.muted,
                  }}
                >
                  {item.role === "user" ? "You" : "Calendar AI"}
                </T>
                <T style={{ fontSize: 13, lineHeight: 20 }}>{item.content}</T>
              </View>
            ))}
          </View>
        )}
        <Field
          label="Calendar message"
          placeholder="For example: family lunch on 2027-05-16, noon to 2 pm, America/Chicago."
          multiline
          value={message}
          onChangeText={(value) => {
            setMessage(value);
            invalidateAnalysisInput();
          }}
          editable={!busy}
          maxLength={CALENDAR_LIMITS.maxMessageChars}
        />
        <View style={s.buttons}>
          <Button
            secondary
            icon={FileText}
            disabled={!!busy}
            onPress={() => void attach("text")}
          >
            Attach text or CSV
          </Button>
          <Button
            secondary
            icon={Camera}
            disabled={!!busy}
            onPress={() => void attach("image")}
          >
            Attach calendar photo
          </Button>
        </View>
        {!!source && (
          <View
            testID="calendar-attachment"
            style={[s.attachment, { backgroundColor: theme.background }]}
          >
            {source.kind === "image" && (
              <Image
                accessibilityLabel="Selected calendar photo"
                source={{ uri: source.dataUrl }}
                style={{ width: 56, height: 56, borderRadius: 8 }}
              />
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <T
                numberOfLines={2}
                style={{ fontFamily: font.bold, fontSize: 12 }}
              >
                {source.name}
              </T>
              <T style={s.description}>
                {source.kind === "image"
                  ? "Photo prepared for analysis"
                  : "Text attachment ready"}
              </T>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove calendar attachment"
              disabled={!!busy}
              onPress={() => {
                setSource(undefined);
                clearSourceAnalysis();
              }}
              style={s.smallButton}
            >
              <X size={19} color={theme.ink} />
            </Pressable>
          </View>
        )}
        <View style={{ alignItems: "flex-start" }}>
          <Button
            icon={Sparkles}
            disabled={
              !!busy || analysisTerminal || (!message.trim() && !source)
            }
            onPress={() => void analyze()}
          >
            {busy === "analysis"
              ? "Reading calendar…"
              : analysisPending
                ? "Check existing analysis"
                : "Propose events"}
          </Button>
        </View>
        {!!notice && <Banner text={notice} onDismiss={() => setNotice("")} />}
        {analysisTerminal && (
          <View style={{ alignItems: "flex-start" }}>
            <Button
              secondary
              disabled={!!busy}
              onPress={() => {
                analysis.current = null;
                setAnalysisRequestId(null);
                setAnalysisTerminal(false);
                setAnalysisPending(false);
                invalidateReview();
                setNotice(
                  "The next Propose events action starts a new analysis and may incur another charge. Nothing has been added.",
                );
              }}
            >
              New analysis (may incur a charge)
            </Button>
          </View>
        )}
        {!!questions.length && (
          <View
            testID="calendar-questions"
            style={[s.message, { backgroundColor: themeTint(theme.accent) }]}
          >
            <T style={{ fontFamily: font.bold, fontSize: 13 }}>
              Please clarify
            </T>
            {questions.map((question, index) => (
              <T key={index} style={{ fontSize: 12, lineHeight: 19 }}>
                • {question}
              </T>
            ))}
            <T style={s.description}>
              Reply above or edit the proposals below. Resolve these questions
              before marking an event reviewed.
            </T>
          </View>
        )}
        {!!rows.length && (
          <View testID="calendar-proposals" style={{ gap: 14 }}>
            <T
              accessibilityRole="header"
              style={{ fontFamily: font.heading, fontSize: 18 }}
            >
              Review proposed events
            </T>
            <T style={s.description}>
              AI can misread calendars. Check every date, year, time and
              timezone. Editing an event resets its review check.
            </T>
            {rows.map((row, index) => {
              const proposal = row.proposal;
              const validation = proposalToEvent(proposal);
              const start = resolveCalendarDateTime(
                proposal.startDate,
                proposal.startTime,
                proposal.timeZone,
                proposal.startOffset,
              );
              const end = resolveCalendarDateTime(
                proposal.endDate,
                proposal.endTime,
                proposal.timeZone,
                proposal.endOffset,
              );
              const field = (
                label: string,
                key: keyof CalendarProposal,
                placeholder: string,
                maxLength: number,
                multiline = false,
              ) => (
                <Field
                  key={key}
                  label={label}
                  accessibilityLabel={`Event ${index + 1} ${label.toLowerCase()}`}
                  value={String(proposal[key] || "")}
                  onChangeText={(value) =>
                    edit(index, {
                      [key]: ["title", "description", "location"].includes(key)
                        ? value
                        : value || null,
                    })
                  }
                  placeholder={placeholder}
                  maxLength={maxLength}
                  editable={!busy}
                  autoCorrect={false}
                  autoCapitalize="none"
                  multiline={multiline}
                />
              );
              return (
                <View
                  testID={`calendar-proposal-${index}`}
                  key={proposal.id}
                  style={[
                    s.proposal,
                    {
                      borderColor: themeTint(theme.ink, 0.14),
                      backgroundColor: theme.background,
                    },
                  ]}
                >
                  <View style={s.heading}>
                    <View style={{ flex: 1, gap: 5 }}>
                      <T style={{ fontFamily: font.bold, fontSize: 14 }}>
                        {proposal.title || `Event ${index + 1}`}
                      </T>
                      <T style={s.description}>
                        {proposal.startDate || "Date needed"}{" "}
                        {proposal.startTime || "Time needed"} →{" "}
                        {proposal.endDate || "End date needed"}{" "}
                        {proposal.endTime || "End time needed"}
                      </T>
                      <T style={s.description}>
                        {proposal.timeZone || "Timezone needed"}
                      </T>
                    </View>
                    <IconButton
                      icon={X}
                      label={`Remove proposal ${index + 1}`}
                      onPress={() => {
                        if (!busy) {
                          setRows((previous) =>
                            previous.filter((_, i) => i !== index),
                          );
                          setConfirmation(null);
                        }
                      }}
                      style={{ width: 44, height: 44 }}
                    />
                  </View>
                  <Checkbox
                    label={`Include event ${index + 1}`}
                    checked={row.included}
                    disabled={!!busy}
                    onChange={() => {
                      setRows((previous) =>
                        previous.map((item, i) =>
                          i === index
                            ? { ...item, included: !item.included }
                            : item,
                        ),
                      );
                      setConfirmation(null);
                    }}
                  >
                    Include this event
                  </Checkbox>
                  <View style={{ alignItems: "flex-start" }}>
                    <Button
                      secondary
                      disabled={!!busy}
                      onPress={() =>
                        setRows((previous) =>
                          previous.map((item, i) =>
                            i === index
                              ? { ...item, expanded: !item.expanded }
                              : item,
                          ),
                        )
                      }
                    >
                      {row.expanded
                        ? `Collapse event ${index + 1}`
                        : `Edit event ${index + 1}`}
                    </Button>
                  </View>
                  {row.expanded && (
                    <View style={{ gap: 2 }}>
                      {field("Title", "title", "Event title", 120)}
                      <View style={s.fields}>
                        <View style={s.fieldColumn}>
                          {field("Start date", "startDate", "YYYY-MM-DD", 10)}
                        </View>
                        <View style={s.fieldColumn}>
                          {field("Start time", "startTime", "HH:mm", 5)}
                        </View>
                      </View>
                      <View style={s.fields}>
                        <View style={s.fieldColumn}>
                          {field("End date", "endDate", "YYYY-MM-DD", 10)}
                        </View>
                        <View style={s.fieldColumn}>
                          {field("End time", "endTime", "HH:mm", 5)}
                        </View>
                      </View>
                      {field("Timezone", "timeZone", "America/Chicago", 100)}
                      {(!!start.offsetChoices?.length ||
                        !!proposal.startOffset) && (
                        <View>
                          {field(
                            "Start UTC offset",
                            "startOffset",
                            "-05:00",
                            6,
                          )}
                          {!!start.offsetChoices?.length && (
                            <T style={s.description}>
                              Choose a matching start UTC offset:{" "}
                              {start.offsetChoices.join(" or ")}.
                            </T>
                          )}
                        </View>
                      )}
                      {(!!end.offsetChoices?.length ||
                        !!proposal.endOffset) && (
                        <View>
                          {field("End UTC offset", "endOffset", "-05:00", 6)}
                          {!!end.offsetChoices?.length && (
                            <T style={s.description}>
                              Choose a matching end UTC offset:{" "}
                              {end.offsetChoices.join(" or ")}.
                            </T>
                          )}
                        </View>
                      )}
                      {field(
                        "Location",
                        "location",
                        "Optional place or address",
                        200,
                      )}
                      {field(
                        "Description",
                        "description",
                        "Optional details",
                        2000,
                        true,
                      )}
                    </View>
                  )}
                  {!!proposal.issues.length && (
                    <View style={{ gap: 4 }}>
                      {proposal.issues.map((issue, i) => (
                        <T
                          key={i}
                          style={{
                            fontSize: 12,
                            lineHeight: 19,
                            color: colors.muted,
                          }}
                        >
                          Check: {issue}
                        </T>
                      ))}
                    </View>
                  )}
                  {!!validation.errors.length && (
                    <View accessibilityLiveRegion="polite" style={{ gap: 4 }}>
                      {validation.errors.map((error, i) => (
                        <T
                          key={i}
                          style={{
                            fontSize: 12,
                            lineHeight: 19,
                            color: colors.orange,
                          }}
                        >
                          {error}
                        </T>
                      ))}
                    </View>
                  )}
                  <Checkbox
                    label={`Review event ${index + 1} dates and timezone`}
                    checked={row.reviewed}
                    disabled={
                      !!busy || !row.included || !!validation.errors.length
                    }
                    onChange={() => {
                      setRows((previous) =>
                        previous.map((item, i) =>
                          i === index
                            ? { ...item, reviewed: !item.reviewed }
                            : item,
                        ),
                      );
                      setConfirmation(null);
                    }}
                  >
                    I checked the dates, year, times and timezone, and resolved
                    the questions for this event.
                  </Checkbox>
                </View>
              );
            })}
            <View style={{ alignItems: "flex-start" }}>
              <Button disabled={!!busy || !ready} onPress={review}>
                Review {included.length}{" "}
                {included.length === 1 ? "event" : "events"}
              </Button>
            </View>
          </View>
        )}
      </Card>
      <Modal
        visible={!!confirmation}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!busy) setConfirmation(null);
        }}
      >
        <View style={s.scrim}>
          <Pressable
            accessible={false}
            onPress={() => {
              if (!busy) setConfirmation(null);
            }}
            style={StyleSheet.absoluteFill}
          />
          <View
            testID="calendar-import-confirmation"
            accessibilityViewIsModal
            style={[s.confirmation, { backgroundColor: theme.surface }]}
          >
            <T
              accessibilityRole="header"
              style={{ fontFamily: font.heading, fontSize: 21 }}
            >
              Save to {circle?.name || "this Circle"}?
            </T>
            <T style={s.description}>
              Only the reviewed events below will be added. Matching events
              already on this Circle’s calendar are skipped.
            </T>
            <ScrollView contentContainerStyle={{ gap: 12 }}>
              {confirmation?.map((event, index) => (
                <View key={index} style={{ gap: 4 }}>
                  <T style={{ fontFamily: font.bold, fontSize: 13 }}>
                    {event.title}
                  </T>
                  <T style={s.description}>
                    {event.startsAt} → {event.endsAt} (UTC)
                  </T>
                  <T style={s.description}>{event.location}</T>
                </View>
              ))}
            </ScrollView>
            <View style={s.buttons}>
              <Button disabled={!!busy} onPress={() => void save()}>
                {busy === "save"
                  ? "Saving events…"
                  : `Confirm save ${confirmation?.length || 0} ${confirmation?.length === 1 ? "event" : "events"}`}
              </Button>
              <Button
                secondary
                disabled={!!busy}
                onPress={() => setConfirmation(null)}
              >
                Back to editing
              </Button>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  heading: { flexDirection: "row", alignItems: "center", gap: 10 },
  description: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  fieldColumn: { flex: 1, minWidth: 140 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  message: { maxWidth: "100%", borderRadius: 12, padding: 12, gap: 5 },
  attachment: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    padding: 10,
    borderRadius: 12,
  },
  smallButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  proposal: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  checkbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingVertical: 8,
  },
  tick: {
    width: 20,
    height: 20,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  scrim: {
    flex: 1,
    backgroundColor: "#153A3466",
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmation: {
    width: "100%",
    maxWidth: 600,
    maxHeight: "90%",
    padding: 20,
    borderRadius: 22,
    gap: 16,
  },
});
