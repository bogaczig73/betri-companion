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

## Testing without auth

There is no auth yet (testing phase). The header has an **"Acting as"
switcher** that stores the selected user id in a cookie; `getActingUser()` in
`src/lib/acting-user.ts` is the single place that resolves the current user,
so swapping in a real session later is a drop-in.

## Phase status

- [x] Phase 0 — foundation: scaffold, Neon + Drizzle + pgvector, user switcher, Vercel deploy
- [x] Phase 1 — core domain: workouts CRUD, roster, athlete dashboard
- [x] Phase 2 — training plan builder
- [ ] Phase 3 — FIT file upload (first data source; provider APIs pending approval)
- [ ] Phase 4 — chat with workout mentions
- [ ] Phase 5 — lactate testing module
- [ ] Phase 6 — science paper knowledge base (RAG)
- [ ] Phase 7 — AI workout analysis (grounded)
- [ ] Phase 8 — Strava + Garmin + Apple Health export
- [ ] Phase 9 — AI training-plan evaluator

Sports supported: `run`, `bike`, `swim`, `strength` (gym).
