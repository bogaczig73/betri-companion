import type { Sport } from "@/db/schema";
import { SPORTS } from "@/lib/sports";
import { cn } from "@/lib/utils";

export function SportBadge({ sport }: { sport: Sport }) {
  const { label, icon: Icon, className } = SPORTS[sport];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        className,
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}
