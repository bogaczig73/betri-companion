"use client";

import { Check, FileStack } from "lucide-react";
import { useState, useTransition } from "react";

import { saveWorkoutAsTemplate } from "@/app/actions/templates";
import { Button } from "@/components/ui/button";

export function SaveTemplateButton({ workoutId }: { workoutId: string }) {
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending || saved}
      onClick={() =>
        start(async () => {
          await saveWorkoutAsTemplate(workoutId);
          setSaved(true);
        })
      }
    >
      {saved ? <Check className="size-4" /> : <FileStack className="size-4" />}
      {saved ? "Saved" : pending ? "Saving…" : "Save as template"}
    </Button>
  );
}
