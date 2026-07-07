"use client";

import { Droplet } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { addLactateToWorkout } from "@/app/actions/lactate";
import { Button } from "@/components/ui/button";

// Creates the workout's attached lactate test; the page re-renders with the
// inline step editor + analysis in its place.
export function AddLactateButton({ workoutId }: { workoutId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await addLactateToWorkout(workoutId);
          router.refresh();
        })
      }
    >
      <Droplet className="size-4" />
      {pending ? "Adding…" : "Add lactate data"}
    </Button>
  );
}
