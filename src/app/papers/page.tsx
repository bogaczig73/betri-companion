import { FileText } from "lucide-react";
import { redirect } from "next/navigation";

import { AskLibrary } from "@/components/papers/ask-library";
import { PaperActions } from "@/components/papers/paper-actions";
import { PaperUploadButton } from "@/components/papers/paper-upload-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isAiConfigured } from "@/lib/ai";
import { getActingUser } from "@/lib/acting-user";
import { getPapers, isBlobConfigured } from "@/lib/papers";
import type { PaperStatus } from "@/db/schema";

export const dynamic = "force-dynamic";

const statusBadge: Record<PaperStatus, { label: string; className: string }> = {
  ready: { label: "ready", className: "" },
  processing: { label: "processing", className: "" },
  failed: { label: "failed", className: "text-destructive border-destructive/50" },
};

export default async function PapersPage() {
  const actingUser = await getActingUser();
  if (!actingUser) redirect("/");

  const papers = await getPapers();
  const readyCount = papers.filter((p) => p.status === "ready").length;
  const isCoach = actingUser.role === "coach";
  const missingEnv = [
    ...(isBlobConfigured() ? [] : ["BLOB_READ_WRITE_TOKEN"]),
    ...(isAiConfigured() ? [] : ["ANTHROPIC_API_KEY"]),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
          <p className="text-muted-foreground">
            Training-science papers that ground the AI analysis with citations.
          </p>
        </div>
        {isCoach && <PaperUploadButton />}
      </div>

      {missingEnv.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base">Setup needed</CardTitle>
            <CardDescription>
              Missing environment variables: {missingEnv.join(", ")}. Uploads
              and answers are disabled until they are configured (locally in
              .env.local and on the Vercel project).
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ask the library</CardTitle>
          <CardDescription>
            Answers are grounded in the uploaded papers with page-level
            citations; anything beyond them is marked as inference.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {readyCount === 0 ? (
            <p className="text-sm text-muted-foreground">
              No processed papers yet — upload a PDF to start asking.
            </p>
          ) : (
            <AskLibrary disabled={missingEnv.length > 0} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Papers</CardTitle>
          <CardDescription>
            {papers.length} in the library · {readyCount} ready
          </CardDescription>
        </CardHeader>
        <CardContent>
          {papers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No papers yet.{" "}
              {isCoach
                ? "Upload a training-science PDF to build the knowledge base."
                : "Your coach hasn't added any papers yet."}
            </p>
          ) : (
            <ul className="space-y-2">
              {papers.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={`/api/papers/${p.id}/file`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 items-center gap-1.5 text-sm font-medium underline-offset-2 hover:underline"
                      >
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{p.title}</span>
                      </a>
                      <Badge
                        variant="outline"
                        className={statusBadge[p.status].className}
                      >
                        {statusBadge[p.status].label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[p.authors, p.journal, p.year].filter(Boolean).join(" · ") ||
                        p.fileName}
                    </p>
                    {p.status === "failed" && p.statusMessage && (
                      <p className="mt-0.5 text-xs text-destructive">
                        {p.statusMessage}
                      </p>
                    )}
                    {p.abstract && (
                      <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                        {p.abstract}
                      </p>
                    )}
                  </div>
                  {isCoach && (
                    <PaperActions paperId={p.id} status={p.status} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
