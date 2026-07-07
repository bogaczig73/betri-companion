"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { FitImportResult } from "@/lib/fit";
import { cn } from "@/lib/utils";

export function FitUploadButton({ athleteId }: { athleteId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<FitImportResult[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setResults([]);
    try {
      const formData = new FormData();
      formData.set("athleteId", athleteId);
      for (const file of files) formData.append("files", file);
      const res = await fetch("/api/fit/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setResults([
          {
            fileName: "",
            status: "error",
            message: data.error ?? "Upload failed",
            workouts: [],
          },
        ]);
      } else {
        setResults(data.results);
        router.refresh();
      }
    } catch {
      setResults([
        { fileName: "", status: "error", message: "Upload failed", workouts: [] },
      ]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept=".fit,.FIT"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-3.5" />
        {busy ? "Importing…" : "Upload FIT"}
      </Button>
      {results.map((r, i) => (
        <p
          key={i}
          className={cn(
            "text-xs",
            r.status === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {r.fileName && <span className="font-medium">{r.fileName}: </span>}
          {r.message}
        </p>
      ))}
    </div>
  );
}
