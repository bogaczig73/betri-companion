"use client";

import { RefreshCw, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { deletePaper, reprocessPaper } from "@/app/actions/papers";
import { Button } from "@/components/ui/button";

export function PaperActions({
  paperId,
  status,
}: {
  paperId: string;
  status: "processing" | "ready" | "failed";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-1">
      {error && <span className="text-xs text-destructive">{error}</span>}
      {status !== "ready" && (
        <Button
          variant="ghost"
          size="icon-sm"
          title="Retry processing"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const res = await reprocessPaper(paperId);
              if (res.error) setError(res.error);
            })
          }
        >
          <RefreshCw className="size-3.5" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        title="Remove from library"
        disabled={pending}
        onClick={() => {
          if (!confirm("Remove this paper from the library?")) return;
          startTransition(async () => {
            setError(null);
            await deletePaper(paperId);
          });
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
