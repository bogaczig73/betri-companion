# betri.companion

Training companion for triathletes and their coaches: training plans, workout
sync (FIT upload, Strava, Garmin, Apple Health export), chat with workout
mentions, lactate testing, and AI analysis grounded in a science-paper library.

**Production:** https://betri-companion.vercel.app

## Stack

- Next.js (App Router) + TypeScript on Vercel
- Tailwind CSS + shadcn/ui, TanStack Query, Recharts
- Neon Postgres + Drizzle ORM, pgvector for RAG embeddings
- Anthropic Claude API for analysis (later phases)
- Zod validation on every mutation

## Local development

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL (Neon pooled string)
npm run db:migrate           # apply SQL migrations
npm run db:seed              # seed 1 coach + 2 athletes (idempotent)
npm run dev
```

## Database

- Neon project: `betri-companion` (`ancient-credit-89447271`), database `neondb`
- `npm run db:generate` — generate a migration from `src/db/schema.ts`
- `npm run db:migrate` — apply migrations
- `npm run db:studio` — browse data

## Lactate engine

`src/lib/lactate/` is a pure, framework-free threshold engine ported from the
[`lactater`](https://fmmattioni.github.io/lactater/) R package and validated
against its documented demo (OBLA, Bsln+, Log-log, Dmax family, LTP, LTratio).

- `npm run validate:lactate` — asserts all 17 methods reproduce the reference
  within ±4 W. Run after touching anything under `src/lib/lactate/`.

The core (`analyze/methods/fit/bspline/types`) works in ascending intensity
space; `sport.ts` + `analysis.ts` adapt it to run (pace/km), swim (pace/100m),
and bike (watts).

## Paper library (Phase 6)

No embedding/chunking pipeline yet — deliberately. Uploaded PDFs are stored in
a **private Vercel Blob** store (served via the authenticated
`/api/papers/[id]/file` proxy) and registered with the **Anthropic Files API**
(`anthropic_file_id` on `science_papers`). Claude extracts
title/authors/year/journal/abstract at upload time.

"Ask the library" (`/papers`) answers questions grounded in the papers:
1. If more than 5 papers are ready, Claude triages a compact catalog
   (titles + abstracts) and picks the relevant ones.
2. The chosen PDFs are attached as `document` blocks (`file_id` source) with
   **native citations enabled** and prompt caching on the document prefix; the
   answer renders with page-level citation markers linking back to the PDFs.

The retrieval interface lives in `src/lib/paper-qa.ts`; when the library
outgrows catalog triage (~30–50 papers), swap `selectPapers` for a pgvector
similarity search over the (already-created, dormant) `paper_chunks` table.
Model + provider config is centralized in `src/lib/ai.ts`.

Requires `ANTHROPIC_API_KEY` and `BLOB_READ_WRITE_TOKEN`; the `/papers` page
shows a setup banner listing whichever is missing, and failed papers can be
reprocessed from the UI after fixing the env.

## AI analysis (Phase 7)

Workout and lactate-test detail pages have an **AI analysis** card: one click
serializes the subject (prescription + structure + actuals, lactate steps +
the engine's per-method threshold estimates, plus the athlete's last 3 weeks
of training and most recent LT1/LT2 consensus) and answers through the same
grounded pipeline as "Ask the library" (`answerGrounded` in
`src/lib/paper-qa.ts`). Every run is stored as an `analysis_results` row
(content snapshotted as JSONB, so it renders even if a paper is later
deleted); re-running appends, deleting is soft.

Claims carry page-level `[n]` citations; the prompt confines uncited
interpretation to a closing "**Beyond the papers:**" paragraph, and the UI
labels that split explicitly. Logic lives in `src/lib/analysis.ts`, the route
is `POST /api/analysis`, the panel is
`src/components/analysis/analysis-panel.tsx`.

## Testing without auth

There is no auth yet (testing phase). The header has an **"Acting as"
switcher** that stores the selected user id in a cookie; `getActingUser()` in
`src/lib/acting-user.ts` is the single place that resolves the current user,
so swapping in a real session later is a drop-in.

## Phase status

- [x] Phase 0 — foundation: scaffold, Neon + Drizzle + pgvector, user switcher, Vercel deploy
- [x] Phase 1 — core domain: workouts CRUD, roster, athlete dashboard
- [x] Phase 2 — training plan builder
- [x] Phase 3 — FIT file upload (first data source; provider APIs pending approval)
- [x] Phase 4 — chat with workout mentions
- [x] Phase 5 — lactate testing module (LT1/LT2 across methods; engine validated vs lactater)
- [x] Phase 6 — science paper library (Blob + Anthropic Files API + native citations; pgvector deferred)
- [x] Phase 7 — AI workout analysis (grounded in the paper library, stored with citations)
- [ ] Phase 8 — Strava + Garmin + Apple Health export
- [ ] Phase 9 — AI training-plan evaluator

Sports supported: `run`, `bike`, `swim`, `strength` (gym).
