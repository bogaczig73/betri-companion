"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";

import { sendMessage } from "@/app/actions/chat";
import { SportBadge } from "@/components/sport-badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Workout } from "@/db/schema";
import { formatDate } from "@/lib/format";
import { SPORTS } from "@/lib/sports";

type MentionDraft = { id: string; title: string };

// Finds an in-progress "@query" immediately before the cursor: an "@" at the
// start of the text or after whitespace, with no line break between it and
// the cursor.
function activeMentionQuery(
  value: string,
  cursor: number,
): { start: number; query: string } | null {
  const upToCursor = value.slice(0, cursor);
  const at = upToCursor.lastIndexOf("@");
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(upToCursor[at - 1])) return null;
  const query = upToCursor.slice(at + 1);
  if (/[\n\r]/.test(query)) return null;
  return { start: at, query };
}

export function MessageComposer({
  threadId,
  mentionableWorkouts,
}: {
  threadId: string;
  mentionableWorkouts: Workout[];
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0);
  const [mentions, setMentions] = useState<MentionDraft[]>([]);
  const [pickerDismissed, setPickerDismissed] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const mention = activeMentionQuery(value, cursor);
  const suggestions = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return mentionableWorkouts
      .filter(
        (w) =>
          w.title.toLowerCase().includes(q) ||
          SPORTS[w.sport].label.toLowerCase().includes(q) ||
          w.date.includes(q),
      )
      .slice(0, 6);
  }, [mention, mentionableWorkouts]);
  const pickerOpen = !pickerDismissed && mention !== null && suggestions.length > 0;

  function syncCursor() {
    setCursor(textareaRef.current?.selectionStart ?? 0);
  }

  function selectWorkout(w: Workout) {
    if (!mention) return;
    const insert = `@${w.title} `;
    const next = value.slice(0, mention.start) + insert + value.slice(cursor);
    setValue(next);
    setMentions((prev) =>
      prev.some((m) => m.id === w.id)
        ? prev
        : [...prev, { id: w.id, title: w.title }],
    );
    setHighlighted(0);
    const newCursor = mention.start + insert.length;
    setCursor(newCursor);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(newCursor, newCursor);
      }
    });
  }

  function send() {
    const body = value.trim();
    if (!body || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await sendMessage({
        threadId,
        body,
        mentionedWorkoutIds: mentions.map((m) => m.id),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setValue("");
      setMentions([]);
      setCursor(0);
      router.refresh();
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (pickerOpen) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectWorkout(suggestions[highlighted] ?? suggestions[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPickerDismissed(true);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="relative space-y-2">
      {pickerOpen && (
        <div className="absolute bottom-full left-0 z-10 mb-2 w-full max-w-md overflow-hidden rounded-md border bg-popover shadow-md">
          <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
            Mention a workout — ↑↓ to pick, Enter to insert
          </p>
          <ul>
            {suggestions.map((w, i) => (
              <li key={w.id}>
                <button
                  type="button"
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                    i === highlighted ? "bg-accent" : ""
                  }`}
                  onMouseEnter={() => setHighlighted(i)}
                  onClick={() => selectWorkout(w)}
                >
                  <SportBadge sport={w.sport} />
                  <span className="min-w-0 truncate font-medium">{w.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {formatDate(w.date)} · {w.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mentions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mentions.map((m) => (
            <span
              key={m.id}
              className="inline-flex items-center gap-1 rounded-md border bg-secondary px-2 py-0.5 text-xs"
            >
              @{m.title}
              <button
                type="button"
                aria-label={`Remove mention of ${m.title}`}
                className="text-muted-foreground hover:text-foreground"
                onClick={() =>
                  setMentions((prev) => prev.filter((x) => x.id !== m.id))
                }
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          placeholder="Write a message — type @ to mention a workout"
          rows={2}
          className="min-h-16 resize-none"
          onChange={(e) => {
            setValue(e.target.value);
            setPickerDismissed(false);
            setHighlighted(0);
            setCursor(e.target.selectionStart ?? 0);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={syncCursor}
          onClick={syncCursor}
        />
        <Button onClick={send} disabled={pending || value.trim() === ""}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
