-- OwnerCheck MVP Supabase schema
-- Run this in Supabase SQL Editor.

create extension if not exists "uuid-ossp";

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
  brand text not null,
  category text not null,
  image_url text,
  description text,
  starter_questions text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.owned_products (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  ownership_months integer not null default 0,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'photo_verified', 'receipt_verified', 'trusted_owner')),
  rating numeric(2,1) check (rating >= 1 and rating <= 5),
  review_text text,
  pros text,
  cons text,
  would_buy_again boolean,
  verification_image_url text,
  created_at timestamptz not null default now(),
  unique(user_id, product_id)
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
  created_at timestamptz not null default now()
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

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.owned_products enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.reports enable row level security;

create policy "Products are public" on public.products for select using (true);
create policy "Owned products are public" on public.owned_products for select using (true);
create policy "Questions are public" on public.questions for select using (true);
create policy "Answers are public" on public.answers for select using (true);

create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

create policy "Users can claim owned products" on public.owned_products for insert with check (auth.uid() = user_id);
create policy "Users can update own owned products" on public.owned_products for update using (auth.uid() = user_id);

create policy "Users can ask questions" on public.questions for insert with check (auth.uid() = buyer_id or buyer_id is null);
create policy "Users can answer questions" on public.answers for insert with check (auth.uid() = owner_id);
create policy "Users can report content" on public.reports for insert with check (auth.uid() = reporter_id or reporter_id is null);
