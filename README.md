# OwnerCheck MVP

A starter web app for the idea: **Ask real owners before you buy.**

This MVP includes:

- Landing page
- Product exploration page
- Product detail pages
- Seeded creator/tech products
- Owner evaluations
- Buyer questions
- Owner answer forms
- Credits concept
- Supabase schema and seed SQL

## Tech stack

- Next.js
- TypeScript
- Tailwind CSS
- Supabase-ready database schema

## Run locally

```bash
npm install
npm run dev
```

Then open:

```bash
http://localhost:3000
```

## Supabase setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Add your Supabase URL and anon key.
4. Open Supabase SQL Editor.
5. Run `supabase/schema.sql`.
6. Run `supabase/seed.sql`.

The current UI uses `lib/mockData.ts` so it works immediately without Supabase. The next step is replacing the mock data imports with Supabase queries.

## Suggested next build steps

1. Add real auth with Supabase.
2. Save claimed products into `owned_products`.
3. Save questions into `questions`.
4. Save answers into `answers`.
5. Add credit transaction updates.
6. Add image uploads for verification and answers.
7. Add admin moderation dashboard.

## MVP positioning

**OwnerCheck** helps buyers ask product-specific questions to real verified owners.

Core loop:

1. Owner claims product.
2. Buyer asks question.
3. Owner answers.
4. Owner earns credits.
5. Buyer marks helpful.
