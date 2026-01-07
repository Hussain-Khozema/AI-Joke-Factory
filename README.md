# The Joke Factory (Frontend)

React + Vite frontend for **The Joke Factory** simulation.

### What this repo includes
- **Role-based UI**: Instructor, Joke Maker (JM), Quality Control (QC), Customer
- **Two runtime modes**
  - **Mock API mode**: runs entirely in the browser (persists state in `localStorage`)
  - **Backend mode**: talks to a real API via `VITE_API_BASE_URL`
- **Netlify-ready deploy**: `netlify.toml` + SPA redirects

---

## Tech stack
- **React 19** + **TypeScript**
- **Vite 6**
- **Tailwind (CDN)** for styling (see `index.html`)
- **Recharts** (charts) + **lucide-react** (icons)

---

## Requirements
- **Node.js 20+** recommended (matches `netlify.toml`)
- **npm**

---

## Project structure (high level)
- **`views/`**: role-based screens (Instructor / JM / QC / Customer)
- **`services/`**: API clients and service wrappers
- **`context.tsx`**: app state + polling + session persistence
- **`types.ts`**: shared domain and API types

### Folder structure

```text
FE/
  App.tsx                 - App shell + role-based routing (and debug panel)
  context.tsx             - Global state, polling, session persistence
  components.tsx          - Shared UI components
  types.ts                - Shared domain + API types
  index.tsx               - React entry point (mounts to `#root`)
  index.html              - HTML shell (+ Tailwind CDN)
  index.css               - Global styles
  Joke Factory BE.json    - Backend/API reference data
  services/               - API layer
    apiClient.ts          - Fetch wrapper + headers + backend/mock switching
    mockApi.ts            - In-browser mock backend + localStorage “DB”
    sessionService.ts     - Session endpoints (join/me/active/team)
    instructorService.ts  - Instructor endpoints (login/lobby/start/end/reset)
    jmService.ts          - Joke Maker endpoints (summary/batches)
    qcService.ts          - QC endpoints (queue/ratings)
    customerService.ts    - Customer endpoints (market/budget/buy/return)
  views/                  - Role screens
    Instructor.tsx        - Instructor UI
    JokeMaker.tsx         - JM UI
    QualityControl.tsx    - QC UI
    Customer.tsx          - Customer UI
  public/
    _redirects            - Netlify SPA fallback routing
  env.example             - Example env vars
  netlify.toml            - Netlify build/publish + env defaults
  package.json            - Scripts + dependencies
  package-lock.json       - Locked dependency versions
  tsconfig.json           - TypeScript config
  vite.config.ts          - Vite config (dev server, aliases)
  README.md               - Docs
```

- **`services/`**: All HTTP calls go through `services/apiClient.ts` (adds `X-User-Id`, chooses backend vs mock).
- **`views/`**: Page-level role UIs; routing is role-based in `App.tsx`.
- **`context.tsx`**: Central state/polling loop; reads/writes session identifiers in `localStorage`.
- **`public/_redirects`** + **`netlify.toml`**: SPA routing + Netlify build/publish configuration.


## Getting started
Install dependencies:

```bash
npm install
```

Run the dev server (default: `http://localhost:3000`):

```bash
npm run dev
```

---

## Configuration
Create a local env file:
- Copy `env.example` → `.env.local`

### Environment variables
- **`VITE_API_BASE_URL`**: Base URL of the backend API (example: `http://localhost:8081`).
  - If not set, dev defaults to `http://localhost:8081` (see `services/apiClient.ts`).
- **`VITE_USE_MOCK_API`**: Set to `true` to force the built-in mock API (`services/mockApi.ts`).
  - In production builds, the app will also fall back to mock mode if `VITE_API_BASE_URL` is not set.
- **`VITE_ENABLE_DEBUG_PANEL`**: Set to `true` to show the debug panel outside of dev (dev always shows it).

---

## Run modes

### 1) Mock API demo (no backend)
1) Create `.env.local`:

```bash
VITE_USE_MOCK_API=true
```

2) Start the app:

```bash
npm run dev
```

3) Join:
- **Students**: use **Student Pair Login** (any names)
- **Instructor**: use one of these names:
  - `Charles2026`
  - `Fernanda2026`

Notes:
- Mock state is stored in `localStorage` under `joke_factory_mock_db_v1`.
- If you get stuck, clear:
  - `joke_factory_user_id`
  - `joke_factory_display_name`
  - `joke_factory_mock_db_v1`

### 2) Connect to a real backend
1) Create `.env.local`:

```bash
VITE_API_BASE_URL=http://localhost:8081
```

2) Start the app:

```bash
npm run dev
```

Verify traffic:
- DevTools → **Network**, filter by `/v1/`
- Backend requests should go to your configured API host (not the Vite dev server)
- The app sends `X-User-Id` after you join a session (stored in `localStorage`)

---

## Scripts
- **`npm run dev`**: start Vite dev server
- **`npm run build`**: production build to `dist/`
- **`npm run preview`**: serve `dist/` locally

---

## Deployment (Netlify)
This repo ships with:
- **`netlify.toml`**: build/publish settings + environment defaults
- **`public/_redirects`**: SPA fallback routing

### Netlify settings
- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Node version**: `20` (set in `netlify.toml`)

### Backend configuration on Netlify
- `netlify.toml` sets `VITE_API_BASE_URL` to `https://jokefactory-be.onrender.com` by default.
- To point at a different backend, override `VITE_API_BASE_URL` in the Netlify UI.
- To deploy with **mock mode** in production, unset/override `VITE_API_BASE_URL` and set `VITE_USE_MOCK_API=true`.

---


