# Polaad Frontend Deploy Package

This package contains the new Polaad frontend at `apps/polaad-web`.

## Build

```bash
npm install
npm run build --workspace @autodealer/polaad-web
```

## Start locally

```bash
npm run dev --workspace @autodealer/polaad-web
```

## Required environment variables

Set the same values used by the existing Polaad frontend:

```env
PORT=
NEXT_PUBLIC_API_BASE_URL=
API_PROXY_TARGET=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

`.env` files are intentionally not included in this zip.
