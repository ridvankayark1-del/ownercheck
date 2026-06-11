# OwnerCheck Handoff

This file is a compact handoff for continuing OwnerCheck work on another computer.

## Project

OwnerCheck is a Next.js + Supabase MVP for real-owner product Q&A.

Users can:
- search and create product pages
- claim products they own
- upload live camera / phone camera verification photos
- answer public product questions
- ask owners direct private questions
- earn credits and trust
- submit owner scorecards
- view product facts enriched from external source snippets

Admins can:
- review products
- enrich products
- import products / URLs
- approve or reject owner verification photos

## Repo

GitHub:

```bash
https://github.com/ridvankayark1-del/ownercheck.git
```

Current branch:

```bash
main
```

Latest pushed commit at time of this handoff:

```text
d43effd Harden admin auth and ignore local env
```

Important: there are local uncommitted changes after `d43effd` for MVP flow bug fixes:

```text
app/auth/page.tsx
app/product/[slug]/page.tsx
components/ClaimProductModal.tsx
components/DirectQuestionForm.tsx
supabase/schema.sql
supabase/upgrade-existing-supabase.sql
```

These local changes fix:
- product claim return after sign-in
- scorecard save completion state
- direct question credit deduction through secure RPC

## Local Setup On Another PC

Clone:

```bash
git clone https://github.com/ridvankayark1-del/ownercheck.git
cd ownercheck
npm install
```

Create local env file from the example:

```bash
cp env.local.example.json env.local.json
```

Fill in real values locally. Do not commit `env.local.json`.

Run dev:

```bash
npm run dev
```

The app usually runs on:

```text
http://localhost:3001
```

## Env Vars

Local env values needed:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3001
BRAVE_SEARCH_API_KEY=
```

Vercel production should have:

```text
NEXT_PUBLIC_SITE_URL=https://ownercheck.vercel.app
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
BRAVE_SEARCH_API_KEY=
```

Phone QR verification only works from a phone using a public HTTPS URL, such as Vercel or an HTTPS tunnel.

## Security / Git History

`env.local.json` was removed from Git history and is ignored.

Current protections:
- `.gitignore` includes `env.local.json`
- `env.local.example.json` contains placeholders only
- hardcoded admin email checks were removed from app code
- admin checks now use `admin_users` and `is_admin()`

Seeded initial admin in SQL:

```text
reportkowalski1@gmail.com
```

For a real launch, rotate all previously exposed prototype keys.

## Supabase Migration

Run the full contents of:

```text
supabase/upgrade-existing-supabase.sql
```

in Supabase SQL Editor after pulling the latest code.

Important database additions include:
- `admin_users`
- `is_admin()`
- strict RLS policies
- private owner verification photo storage policies
- `owner_product_ratings`
- `direct_questions`
- `create_direct_question(product_id_input uuid, question_text_input text)`
- phone verification RPC
- enrichment/product fact columns

## Recent MVP Flow Fixes

### 1. Product Claim Return After Sign-In

Problem:
- User clicked `I own this product`
- after sign-in, app went to `/profile`

Fix:
- auth page now respects safe `redirect` / `next` URL params
- claim modal sign-in link uses:

```text
/auth?redirect=/product/[slug]?claim=1
```

Expected:
- after sign-in, user returns to the product page and claim modal opens

### 2. Owner Scorecard Save State

Problem:
- after saving scorecard, the modal still showed `Do this later`

Fix:
- claim modal checks whether `owner_product_ratings` already exists
- after save, local state marks scorecard completed
- completed state hides `Do this later`
- redirects back to product page

### 3. Direct Question Credit Deduction

Problem:
- direct question was created but credit deduction failed because profile credit updates are blocked by RLS/trigger

Fix:
- direct question creation moved to secure Supabase RPC:

```sql
public.create_direct_question(product_id_input uuid, question_text_input text)
```

The RPC:
- checks authenticated buyer
- checks buyer has at least 25 credits
- selects eligible owner, excluding buyer
- creates `direct_questions`
- deducts 25 credits
- inserts credit transaction
- rolls back everything if any step fails

RLS remains strict:
- direct client inserts into `direct_questions` are denied
- client cannot directly mutate `profiles.credit_balance`

## Testing Checklist

### Claim Return Flow

1. Log out.
2. Open a product page.
3. Click `I own this product`.
4. Click sign in.
5. Log in.
6. Expected: app returns to `/product/[slug]?claim=1` and opens the claim modal.

### Scorecard Save Flow

1. Claim a product.
2. Complete same-device verification.
3. Save owner scorecard.
4. Expected: saved state appears and `Do this later` disappears.
5. Refresh product page and reopen ownership modal.
6. Expected: scorecard is not shown as unsaved again.

### Direct Question Flow

1. Use a buyer with at least 25 credits.
2. Ask an owner directly.
3. Expected: direct question is created and buyer credits decrease by 25.
4. Use a buyer with fewer than 25 credits.
5. Expected: no direct question is created.

### Admin Flow

1. Log in as an admin from `admin_users`.
2. Open `/admin/products`.
3. Verify access works.
4. Log in as non-admin.
5. Expected: admin pages deny access.

### Verification Photos

1. Submit same-device verification.
2. Submit phone verification from public HTTPS URL.
3. Open `/admin/owner-verifications`.
4. Expected: admin can preview photos through signed URLs.
5. Public users cannot directly read verification photos.

## Known Issues / Next Work

- Public question credit flow still has client-side credit updates in older components and should be moved to secure RPCs next.
- Public answer reward and helpful reward flows also still need secure server-side mutations.
- Admin product updates are protected by RLS, but UI should continue to be tested after each migration.
- Phone testing requires public HTTPS, not localhost.
- Vercel needs the same env vars after any key rotation.

## Useful Commands

Build:

```bash
npm run build
```

Check status:

```bash
git status --short
```

Pull latest on another PC:

```bash
git pull origin main
```

If history was rewritten and your clone complains:

```bash
git fetch origin
git reset --hard origin/main
```
