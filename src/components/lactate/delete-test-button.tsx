"use client";

import { Trash2 } from "lucide-react";
import { useTransition } from "react";

import { deleteTest } from "@/app/actions/lactate";
import { Button } from "@/components/ui/button";

export function DeleteTestButton({ testId }: { testId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (confirm("Delete this lactate test and all its steps?")) {
          startTransition(() => deleteTest(testId));
        }
      }}
    >
      <Trash2 className="size-4" />
      Delete test
    </Button>
  );
}
