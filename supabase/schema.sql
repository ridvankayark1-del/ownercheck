-- OwnerCheck MVP Supabase schema
-- Run this in Supabase SQL Editor.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  credit_balance integer not null default 50,
  trust_score integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  slug text unique not null,
  name text not null,
  brand text,
  category text,
  image_url text,
  description text,
  ai_summary text,
  starter_questions text[] not null default '{}',
  evaluation_criteria text[] not null default '{}',
  search_keywords text[] not null default '{}',
  data_source text not null default 'seed',
  ai_generated boolean not null default false,
  product_verification_status text not null default 'user_submitted' check (product_verification_status in ('catalog_verified', 'user_submitted', 'needs_review', 'rejected')),
  source_url text,
  verified_source text,
  external_product_id text,
  specs jsonb,
  external_summary text,
  external_summary_sources jsonb,
  common_praise jsonb,
  common_complaints jsonb,
  external_review_links jsonb,
  external_summary_updated_at timestamptz,
  enrichment_status text not null default 'not_enriched',
  created_at timestamptz not null default now()
);

create table if not exists public.owned_products (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  ownership_months integer not null default 0,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'photo_submitted', 'photo_verified', 'verification_rejected', 'receipt_verified', 'trusted_owner')),
  rating numeric(2,1) check (rating >= 1 and rating <= 5),
  review_text text,
  pros text,
  cons text,
  would_buy_again boolean,
  verification_photo_url text,
  verification_code text,
  created_at timestamptz not null default now(),
  constraint unique_user_product_claim unique(user_id, product_id)
);

create table if not exists public.questions (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.products(id) on delete cascade,
  buyer_id uuid references public.profiles(id) on delete set null,
  buyer_name text,
  question_text text not null,
  credit_reward integer not null default 10,
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.answers (
  id uuid primary key default uuid_generate_v4(),
  question_id uuid not null references public.questions(id) on delete cascade,
  owned_product_id uuid references public.owned_products(id) on delete set null,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  answer_text text not null,
  image_url text,
  helpful_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint unique_user_answer_per_question unique(question_id, owner_id)
);

create table if not exists public.direct_questions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  buyer_id uuid references public.profiles(id) on delete cascade,
  owner_id uuid references public.profiles(id) on delete cascade,
  question_text text not null,
  answer_text text,
  status text not null default 'pending' check (status in ('pending', 'answered')),
  credit_cost integer not null default 25,
  credit_reward integer not null default 20,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create table if not exists public.answer_helpful_votes (
  id uuid primary key default uuid_generate_v4(),
  answer_id uuid not null references public.answers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(answer_id, user_id)
);

create table if not exists public.credit_transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  reason text not null,
  related_question_id uuid references public.questions(id) on delete set null,
  related_answer_id uuid references public.answers(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default uuid_generate_v4(),
  reporter_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('product', 'owned_product', 'question', 'answer', 'profile')),
  target_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('owner-verifications', 'owner-verifications', true)
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.owned_products enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.direct_questions enable row level security;
alter table public.answer_helpful_votes enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.reports enable row level security;

create policy "Products are public" on public.products for select using (true);
create policy "Owned products are public" on public.owned_products for select using (true);
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
