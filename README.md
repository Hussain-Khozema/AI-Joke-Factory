<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# The Joke Factory (Frontend)

React + Vite frontend for **The Joke Factory** simulation.

This repo supports:
- **Local demo mode** (Mock API, no backend required)
- **Local integration mode** (connect to your backend via `VITE_API_BASE_URL`)
- **Netlify deployment** (works with Mock API by default, or can connect to a real backend)

## Requirements
- Node.js **20+** recommended (Vite 6 / React 19 ecosystem)
- `npm` (or equivalent)

## Environment
- Copy `env.example` to `.env.local` and adjust as needed.
- Default example points to the Render backend at `https://jokefactory-be.onrender.com`.
- Set `VITE_USE_MOCK_API=true` to force the built-in mock API instead.

## Install
```bash
npm install
```

## Run locally (Mock API demo)
This is the easiest way to demo the full flow without any backend.

1) Create `.env.local` in the project root:
```bash
VITE_USE_MOCK_API=true
```

2) Start the dev server:
```bash
npm run dev
```

3) Login:
- **Instructor**: choose *Instructor Login* tab, password `123`
- **Students**: use *Student Pair Login* (any names)

If you get stuck due to old local sessions, clear these keys in DevTools → Application → Local Storage:
- `joke_factory_user_id`
- `joke_factory_display_name`
- `joke_factory_mock_db_v1`

## Run locally (connect to Backend)
If you have a backend running, point the frontend to it with `VITE_API_BASE_URL`.

1) Create `.env.local`:
```bash
# Example:
VITE_API_BASE_URL=http://localhost:8080
```

2) Start the dev server:
```bash
npm run dev
```

### How to verify requests are hitting the backend
- Open DevTools → Network, filter by `/v1/`
- Confirm requests go to your backend host (not `localhost:3000`)
- Backend should receive header `X-User-Id` once you’ve joined a session

## Netlify deployment
This repo includes `netlify.toml` and `public/_redirects`:
- Publishes from `dist`
- SPA routing fallback (no “Page not found” on refresh/deep links)
- Sets `NODE_VERSION=20`
- Sets `VITE_API_BASE_URL` to the Render backend (`https://jokefactory-be.onrender.com`) by default

### Deploy steps
- In Netlify: **Build command** = `npm run build`
- **Publish directory** = `dist`
- **Base directory** = empty (repo root)

### Environment variables (Netlify)
- **Backend URL**: `VITE_API_BASE_URL` defaults to the Render API (`https://jokefactory-be.onrender.com`) via `netlify.toml`.
  - Override it in the Netlify UI if you deploy a different backend.
- **Use mock API instead**: remove or override `VITE_API_BASE_URL` and set `VITE_USE_MOCK_API=true`.


