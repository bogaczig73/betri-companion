"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { PaperIngestResult } from "@/lib/papers";
import { cn } from "@/lib/utils";

export function PaperUploadButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<PaperIngestResult[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setResults([]);
    try {
      const formData = new FormData();
      for (const file of files) formData.append("files", file);
      const res = await fetch("/api/papers/upload", {
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
          },
        ]);
      } else {
        setResults(data.results);
        router.refresh();
      }
    } catch {
      setResults([{ fileName: "", status: "error", message: "Upload failed" }]);
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
        accept=".pdf,application/pdf"
        multiple
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button disabled={busy} onClick={() => inputRef.current?.click()}>
        <Upload className="size-3.5" />
        {busy ? "Processing…" : "Upload PDF"}
      </Button>
      {busy && (
        <p className="text-xs text-muted-foreground">
          Storing, registering with the Files API and extracting metadata —
          this can take a minute per paper.
        </p>
      )}
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
