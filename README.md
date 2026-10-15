# cpaltracker-react

React/TypeScript UI for `cpaltracker.web`, consuming the existing `/api/v1`
REST layer (KAN-116). New, standalone frontend — no backend/DB change, no
modification to the PHP monolith, which keeps serving traffic unmodified
throughout this rebuild.

Stack, scope and the one deviation from the originally pasted reference
stack (Supabase → REST/cookie `AuthContext`) are recorded once in
[`cpal.docs/architecture/react-frontend-stack-decision.md`](https://github.com/fmguimaraes/cpal.docs/blob/main/architecture/react-frontend-stack-decision.md).
Requirements for this Core epic (KAN-60) live in
[`cpal.docs/features/React-Core-Platform.md`](https://github.com/fmguimaraes/cpal.docs/blob/main/features/React-Core-Platform.md).

## Setup

```bash
npm install
```

Create a `.env.local` (gitignored) with the `/api/v1` target to run against:

```
VITE_API_BASE_URL=http://localhost:8080/api/v1
```

Switching between a local/staging backend and prod is this one value —
never a code change (FR2).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-checks (`tsc -b`) then builds |
| `npm run preview` | Serves the production build locally |
| `npm run lint` | ESLint 9 + typescript-eslint |
| `npm run typecheck` | `tsc --noEmit` against `tsconfig.app.json` |
| `npm run test` | Vitest (unit, jsdom + Testing Library) |
| `npm run test:e2e` | Playwright, against a built-and-previewed app |

## Reusable patterns (read before adding a new feature epic's screens)

- **`src/api/client.ts`** — the only place that calls `fetch` against
  `/api/v1`. Add new endpoint calls here, typed, rather than calling `fetch`
  directly from a component.
- **`src/auth/AuthContext.tsx`** — session state (`account`, `status`) and
  actions (`refresh`, `logout`). Wrap any route that needs auth state in
  this provider (already done at the app root).
- **`src/store/`** — Zustand stores for cross-cutting client state (theme
  today; add new stores per concern, not one giant store).
- **`src/theme/tokens.css`** — the single source of color/spacing/typography/
  breakpoint tokens, for both themes. Add a token here before reaching for a
  raw CSS value in a component.
- Desktop is the primary, acceptance-tested target; mobile must not crash
  but isn't held to the same bar (product decision 2026-10-15).
