# ApparelFlow ERP · Cutting Gatekeeper

A web app that controls the hand-off from the cutting floor to the sewing line:

1. **Cutting supervisors** create cutting orders from garment recipes.
2. **Cutting verifiers** count every cut component against its expected quantity (GREEN / YELLOW / RED).
3. **Sewing supervisors** only ever see batches that passed verification.

> 🚧 Work in progress. The live demo URL, demo credentials for all three roles, the architecture summary and the database schema will be added here.

## Tech stack

Next.js 16 (App Router, TypeScript strict, Tailwind CSS v4) · PostgreSQL on Supabase · Vercel

## Local development

Requires Node.js 22.12 or newer.

```bash
npm ci
npm run dev
```

Then open http://localhost:3000.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Generate Next.js route types, then type-check with `tsc` |
