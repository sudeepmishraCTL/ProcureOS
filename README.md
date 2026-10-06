# ProcureOS

ProcureOS is an evidence-backed procurement intelligence platform for collecting supplier responses, extracting and normalizing quote data, comparing suppliers, modelling sourcing scenarios, and supporting award decisions.

## Stack

- TanStack Start + React + TypeScript
- Vite + Nitro
- Supabase for authentication/data
- Drizzle ORM for PostgreSQL migrations
- OpenAI-compatible API for AI extraction and analysis
- Tailwind CSS

## Run locally

1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and fill in the required values.
3. Install dependencies: `npm install`.
4. Start development: `npm run dev`.
5. Build for production: `npm run build`.
6. Run the production server: `npm start`.

## Environment variables

See `.env.example`. No platform-specific services, gateways, preview brokers, telemetry, or secrets are required.

`AI_BASE_URL` should point to an OpenAI-compatible `/chat/completions` endpoint. `AI_MODEL` controls the model used for extraction and analysis.

## Vercel

The project includes `vercel.json` with TanStack Start framework detection. Connect the repository to Vercel, configure the environment variables in the Vercel project, and use the default Vercel build settings.

Do not commit `.env` or production secrets.
