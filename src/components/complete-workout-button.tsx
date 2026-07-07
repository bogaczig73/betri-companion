"use client";

import { Check } from "lucide-react";
import { useTransition } from "react";

import { completeWorkout } from "@/app/actions/workouts";
import { Button } from "@/components/ui/button";

// One-click "done as planned": flips the workout to completed and copies the
// prescription into the actuals (server-side). Edit the workout afterwards to
// record real numbers.
export function CompleteWorkoutButton({ workoutId }: { workoutId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => startTransition(() => completeWorkout(workoutId))}
    >
      <Check className="size-4" />
      {pending ? "Saving…" : "Done"}
    </Button>
  );
}
