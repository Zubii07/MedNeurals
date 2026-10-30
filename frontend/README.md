# MedNeurals – frontend

React + Vite + Tailwind CSS v4 + shadcn/ui, written in JavaScript/JSX (no TypeScript).
The full plan, design reference and API contract live in `docs/FRONTEND_PLAN.md`.

## Run

```bash
# backend (from the repo root)
cd backend && uvicorn app.main:app --reload      # http://127.0.0.1:8000

# frontend
cd frontend && npm install && npm run dev        # http://localhost:5173
```

The dev server proxies `/api/*` to the backend (`vite.config.js`), so no CORS change is needed.
Set `VITE_API_BASE` to point the app at another base path/origin.

## Scripts

- `npm run dev` – dev server with HMR
- `npm run lint` – ESLint
- `npm run build` – production build to `dist/`
- `npm run preview` – serve the production build

## Adding shadcn components

`npx shadcn@latest add <name>` – `components.json` has `"tsx": false`, so components are generated as `.jsx`
under `src/components/ui/`. Restyle them through the CSS variables in `src/index.css`; do not fork their logic.
