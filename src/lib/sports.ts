import { Bike, Dumbbell, Footprints, Waves, type LucideIcon } from "lucide-react";

import type { Sport } from "@/db/schema";

export const SPORTS: Record<
  Sport,
  { label: string; icon: LucideIcon; className: string }
> = {
  run: {
    label: "Run",
    icon: Footprints,
    className:
      "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  },
  bike: {
    label: "Bike",
    icon: Bike,
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  },
  swim: {
    label: "Swim",
    icon: Waves,
    className: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  },
  strength: {
    label: "Gym",
    icon: Dumbbell,
    className:
      "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  },
};
