# OwnerCheck

OwnerCheck is a Next.js and Supabase MVP for asking real product owners before
buying.

The app lets buyers ask product-specific public questions, send paid direct
questions to eligible owners, and browse owner scorecards. Owners can claim
products, submit camera-based ownership proof, answer questions, and build trust
through credits and helpful feedback. Admins can review submitted products,
approve or reject owner verification photos, import product URLs, and enrich
catalog data from external snippets.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase Auth, Postgres, RLS, RPCs, and Storage
- Brave Search API for admin product enrichment

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local env file:

```bash
cp .env.example .env.local
```

Fill in the values:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3001
BRAVE_SEARCH_API_KEY=
```

Run the dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3001
```

On Windows PowerShell, if script execution blocks `npm`, use:

```bash
npm.cmd run dev
```

## Supabase Setup

For a fresh Supabase project, run:

```text
supabase/schema.sql
```

For an existing OwnerCheck Supabase project, run:

```text
supabase/upgrade-existing-supabase.sql
```

Seed data is available in:

```text
supabase/seed.sql
```

The database includes strict RLS policies, `admin_users`, `is_admin()`, owner
verification storage policies, owner scorecards, direct questions, and secure
RPCs for flows that need atomic credit handling.

## Admin Access

Admin pages use the database-backed `admin_users` table and `is_admin()` RPC.
The prototype seed includes:

```text
reportkowalski1@gmail.com
```

Add or remove admins in Supabase instead of hardcoding email checks in the app.

## Current MVP Flows

- Product search and product pages
- Product claiming by authenticated users
- Same-device live camera verification
- Phone verification through public HTTPS URLs
- Admin verification review with signed photo previews
- Owner scorecards saved in `owner_product_ratings`
- Public product questions and answers
- Direct private owner questions through `create_direct_question(...)`
- Admin product import and Brave Search enrichment

## Known Next Work

- Move public question credit spending into a secure RPC.
- Move public answer rewards into a secure RPC.
- Move helpful-vote trust rewards into a secure RPC.
- Keep testing admin product updates after Supabase migrations.
- Use Vercel or an HTTPS tunnel for phone verification testing; localhost will
  not work from a phone.

## Useful Commands

Build:

```bash
npm.cmd run build
```

Check git state:

```bash
git status --short --branch
```

The detailed cross-machine handoff is in:

```text
OWNERCHECK_HANDOFF.md
```
