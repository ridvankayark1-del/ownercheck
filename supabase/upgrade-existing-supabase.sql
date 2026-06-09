-- OwnerCheck upgrade migration for existing Supabase projects.
-- Run this in Supabase SQL Editor if your project already has older tables.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

alter table public.products
  alter column brand drop not null,
  alter column category drop not null,
  add column if not exists ai_summary text,
  add column if not exists evaluation_criteria text[] not null default '{}',
  add column if not exists search_keywords text[] not null default '{}',
  add column if not exists data_source text not null default 'seed',
  add column if not exists ai_generated boolean not null default false,
  add column if not exists product_verification_status text not null default 'user_submitted',
  add column if not exists source_url text,
  add column if not exists verified_source text,
  add column if not exists external_product_id text,
  add column if not exists specs jsonb,
  add column if not exists external_summary text,
  add column if not exists external_summary_sources jsonb,
  add column if not exists common_praise jsonb,
  add column if not exists common_complaints jsonb,
  add column if not exists external_review_links jsonb,
  add column if not exists external_summary_updated_at timestamptz,
  add column if not exists enrichment_status text not null default 'not_enriched';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_product_verification_status_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_product_verification_status_check
      check (
        product_verification_status in (
          'catalog_verified',
          'user_submitted',
          'needs_review',
          'rejected'
        )
      );
  end if;
end $$;

alter table public.owned_products
  add column if not exists verification_photo_url text,
  add column if not exists verification_code text,
  add column if not exists verification_token text,
  add column if not exists verification_token_expires_at timestamptz,
  add column if not exists verification_challenge text,
  add column if not exists verification_capture_method text;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'owned_products_verification_capture_method_check'
      and conrelid = 'public.owned_products'::regclass
  ) then
    alter table public.owned_products
      drop constraint owned_products_verification_capture_method_check;
  end if;

  alter table public.owned_products
    add constraint owned_products_verification_capture_method_check
    check (
      verification_capture_method is null
      or verification_capture_method in ('upload', 'live_camera', 'phone_camera')
    );
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'owned_products'
      and column_name = 'verification_image_url'
  ) then
    execute '
      update public.owned_products
      set verification_photo_url = verification_image_url
      where verification_photo_url is null
    ';
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'owned_products_verification_status_check'
      and conrelid = 'public.owned_products'::regclass
  ) then
    alter table public.owned_products
      drop constraint owned_products_verification_status_check;
  end if;

  alter table public.owned_products
    add constraint owned_products_verification_status_check
    check (
      verification_status in (
        'unverified',
        'photo_submitted',
        'photo_verified',
        'verification_rejected',
        'receipt_verified',
        'trusted_owner'
      )
    );
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'unique_user_product_claim'
      and conrelid = 'public.owned_products'::regclass
  ) then
    alter table public.owned_products
      add constraint unique_user_product_claim unique(user_id, product_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'unique_user_answer_per_question'
      and conrelid = 'public.answers'::regclass
  ) then
    alter table public.answers
      add constraint unique_user_answer_per_question unique(question_id, owner_id);
  end if;
end $$;

create table if not exists public.answer_helpful_votes (
  id uuid primary key default uuid_generate_v4(),
  answer_id uuid not null references public.answers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(answer_id, user_id)
);

create table if not exists public.owner_product_ratings (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  owned_product_id uuid not null references public.owned_products(id) on delete cascade,
  criteria_scores jsonb not null default '{}'::jsonb,
  overall_rating numeric(2,1) check (overall_rating >= 1 and overall_rating <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'unique_owner_product_rating'
      and conrelid = 'public.owner_product_ratings'::regclass
  ) then
    alter table public.owner_product_ratings
      add constraint unique_owner_product_rating unique(user_id, product_id);
  end if;
end $$;

create table if not exists public.direct_questions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  buyer_id uuid references public.profiles(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete cascade,
  question_text text not null,
  answer_text text,
  status text not null default 'pending',
  credit_cost integer not null default 25,
  credit_reward integer not null default 20,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'direct_questions_status_check'
      and conrelid = 'public.direct_questions'::regclass
  ) then
    alter table public.direct_questions
      add constraint direct_questions_status_check
      check (status in ('pending', 'answered'));
  end if;
end $$;

insert into storage.buckets (id, name, public)
values ('owner-verifications', 'owner-verifications', true)
on conflict (id) do update set public = excluded.public;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.owned_products enable row level security;
alter table public.owner_product_ratings enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.direct_questions enable row level security;
alter table public.answer_helpful_votes enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Products are public" on public.products;
drop policy if exists "Owned products are public" on public.owned_products;
drop policy if exists "Owner product ratings are public" on public.owner_product_ratings;
drop policy if exists "Questions are public" on public.questions;
drop policy if exists "Answers are public" on public.answers;
drop policy if exists "Buyers can read own direct questions" on public.direct_questions;
drop policy if exists "Owners can read assigned direct questions" on public.direct_questions;
drop policy if exists "Helpful votes are public" on public.answer_helpful_votes;
drop policy if exists "Owner verification photos are public" on storage.objects;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Profiles are public" on public.profiles;
drop policy if exists "Users can create own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Authenticated users can award trust" on public.profiles;
drop policy if exists "Authenticated users can create products" on public.products;
drop policy if exists "Admin clients can update products" on public.products;
drop policy if exists "Users can claim owned products" on public.owned_products;
drop policy if exists "Users can update own owned products" on public.owned_products;
drop policy if exists "Admin can review owner verifications" on public.owned_products;
drop policy if exists "Owners can create own product ratings" on public.owner_product_ratings;
drop policy if exists "Owners can update own product ratings" on public.owner_product_ratings;
drop policy if exists "Users can ask questions" on public.questions;
drop policy if exists "Users can update questions they asked" on public.questions;
drop policy if exists "Authenticated users can mark questions answered" on public.questions;
drop policy if exists "Users can answer questions" on public.answers;
drop policy if exists "Buyers can create direct questions" on public.direct_questions;
drop policy if exists "Owners can answer assigned direct questions" on public.direct_questions;
drop policy if exists "Users can mark answers helpful" on public.answer_helpful_votes;
drop policy if exists "Authenticated users can update helpful counts" on public.answers;
drop policy if exists "Users can read own credit transactions" on public.credit_transactions;
drop policy if exists "Users can create own credit transactions" on public.credit_transactions;
drop policy if exists "Users can report content" on public.reports;
drop policy if exists "Users can upload owner verification photos" on storage.objects;
drop policy if exists "Anyone can upload phone verification photos" on storage.objects;

create policy "Products are public" on public.products for select using (true);
create policy "Owned products are public" on public.owned_products for select using (true);
create policy "Owner product ratings are public" on public.owner_product_ratings for select using (true);
create policy "Questions are public" on public.questions for select using (true);
create policy "Answers are public" on public.answers for select using (true);
create policy "Buyers can read own direct questions" on public.direct_questions for select using (auth.uid() = buyer_id);
create policy "Owners can read assigned direct questions" on public.direct_questions for select using (auth.uid() = owner_id);
create policy "Helpful votes are public" on public.answer_helpful_votes for select using (true);
create policy "Owner verification photos are public" on storage.objects for select using (bucket_id = 'owner-verifications');

create policy "Profiles are public" on public.profiles for select using (true);
create policy "Users can create own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Authenticated users can award trust" on public.profiles for update using (auth.uid() is not null);

create policy "Authenticated users can create products" on public.products for insert with check (auth.uid() is not null);
create policy "Admin clients can update products" on public.products for update using (auth.uid() is not null);

create policy "Users can claim owned products" on public.owned_products for insert with check (auth.uid() = user_id);
create policy "Users can update own owned products" on public.owned_products for update using (auth.uid() = user_id);
create policy "Admin can review owner verifications" on public.owned_products for update using ((auth.jwt() ->> 'email') = 'reportkowalski1@gmail.com');
create policy "Owners can create own product ratings" on public.owner_product_ratings for insert with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.owned_products
    where owned_products.id = owner_product_ratings.owned_product_id
      and owned_products.user_id = auth.uid()
      and owned_products.product_id = owner_product_ratings.product_id
  )
);
create policy "Owners can update own product ratings" on public.owner_product_ratings for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.owned_products
    where owned_products.id = owner_product_ratings.owned_product_id
      and owned_products.user_id = auth.uid()
      and owned_products.product_id = owner_product_ratings.product_id
  )
);

create policy "Users can ask questions" on public.questions for insert with check (auth.uid() = buyer_id or buyer_id is null);
create policy "Users can update questions they asked" on public.questions for update using (auth.uid() = buyer_id);
create policy "Authenticated users can mark questions answered" on public.questions for update using (auth.uid() is not null);
create policy "Users can answer questions" on public.answers for insert with check (auth.uid() = owner_id);
create policy "Buyers can create direct questions" on public.direct_questions for insert with check (auth.uid() = buyer_id);
create policy "Owners can answer assigned direct questions" on public.direct_questions for update using (auth.uid() = owner_id);
create policy "Users can mark answers helpful" on public.answer_helpful_votes for insert with check (auth.uid() = user_id);
create policy "Authenticated users can update helpful counts" on public.answers for update using (auth.uid() is not null);
create policy "Users can read own credit transactions" on public.credit_transactions for select using (auth.uid() = user_id);
create policy "Users can create own credit transactions" on public.credit_transactions for insert with check (auth.uid() = user_id);
create policy "Users can report content" on public.reports for insert with check (auth.uid() = reporter_id or reporter_id is null);
create policy "Users can upload owner verification photos" on storage.objects for insert with check (
  bucket_id = 'owner-verifications'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "Anyone can upload phone verification photos" on storage.objects for insert with check (
  bucket_id = 'owner-verifications'
  and (storage.foldername(name))[1] = 'phone-verifications'
);

create or replace function public.submit_owner_phone_verification(
  owned_product_id_input uuid,
  verification_token_input text,
  photo_url_input text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.owned_products
  set
    verification_photo_url = photo_url_input,
    verification_status = 'photo_submitted',
    verification_capture_method = 'phone_camera',
    verification_token = null,
    verification_token_expires_at = null
  where id = owned_product_id_input
    and verification_token = verification_token_input
    and verification_token_expires_at > now();

  if not found then
    raise exception 'This verification link expired. Please return to the product page and generate a new one.';
  end if;
end;
$$;

grant execute on function public.submit_owner_phone_verification(uuid, text, text) to anon, authenticated;
