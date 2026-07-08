"use client";

import { useRouter } from "next/navigation";

const selectClassName =
  "border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-input/30";

export function AthletePicker({
  athletes,
  selectedId,
  month,
}: {
  athletes: { id: string; name: string }[];
  selectedId: string;
  month: string;
}) {
  const router = useRouter();
  return (
    <select
      aria-label="Athlete"
      className={selectClassName}
      value={selectedId}
      onChange={(e) =>
        router.push(`/calendar?month=${month}&athlete=${e.target.value}`)
      }
    >
      {athletes.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
