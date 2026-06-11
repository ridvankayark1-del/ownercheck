-- OwnerCheck upgrade migration for existing Supabase projects.
-- Run this in Supabase SQL Editor if your project already has older tables.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

create table if not exists public.admin_users (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  email text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id)
);

insert into public.admin_users (email, active)
values ('reportkowalski1@gmail.com', true)
on conflict (email) do update set active = excluded.active;

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
  add column if not exists verification_capture_method text,
  add column if not exists verification_level text,
  add column if not exists admin_notes text;

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
values ('owner-verifications', 'owner-verifications', false)
on conflict (id) do update set public = false;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where active = true
      and (
        user_id = auth.uid()
        or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.prevent_non_admin_product_protected_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.product_verification_status is distinct from old.product_verification_status
    or new.data_source is distinct from old.data_source
    or new.verified_source is distinct from old.verified_source
    or new.external_product_id is distinct from old.external_product_id
    or new.source_url is distinct from old.source_url
    or new.image_url is distinct from old.image_url
    or new.specs is distinct from old.specs
    or new.external_summary is distinct from old.external_summary
    or new.external_summary_sources is distinct from old.external_summary_sources
    or new.common_praise is distinct from old.common_praise
    or new.common_complaints is distinct from old.common_complaints
    or new.external_review_links is distinct from old.external_review_links
    or new.external_summary_updated_at is distinct from old.external_summary_updated_at
    or new.enrichment_status is distinct from old.enrichment_status
  then
    raise exception 'Only admins can update protected product fields.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_non_admin_product_protected_updates on public.products;
create trigger prevent_non_admin_product_protected_updates
before update on public.products
for each row execute function public.prevent_non_admin_product_protected_updates();

create or replace function public.prevent_non_admin_owned_product_protected_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
    or new.product_id is distinct from old.product_id
    or new.admin_notes is distinct from old.admin_notes
    or new.verification_level is distinct from old.verification_level
  then
    raise exception 'Only admins can update protected ownership fields.';
  end if;

  if new.verification_status is distinct from old.verification_status
    and not (
      new.user_id = auth.uid()
      and old.verification_status in ('unverified', 'verification_rejected', 'photo_submitted')
      and new.verification_status = 'photo_submitted'
      and new.verification_photo_url is not null
      and new.verification_capture_method in ('live_camera', 'phone_camera')
    )
  then
    raise exception 'Only admins can approve or reject owner verification.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_non_admin_owned_product_protected_updates on public.owned_products;
create trigger prevent_non_admin_owned_product_protected_updates
before update on public.owned_products
for each row execute function public.prevent_non_admin_owned_product_protected_updates();

create or replace function public.prevent_non_admin_profile_reward_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.credit_balance is distinct from old.credit_balance
    or new.trust_score is distinct from old.trust_score
  then
    raise exception 'Credits and trust can only be changed by admin or secure server flows.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_non_admin_profile_reward_updates on public.profiles;
create trigger prevent_non_admin_profile_reward_updates
before update on public.profiles
for each row execute function public.prevent_non_admin_profile_reward_updates();

create or replace function public.prevent_direct_question_protected_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.product_id is distinct from old.product_id
    or new.buyer_id is distinct from old.buyer_id
    or new.owner_id is distinct from old.owner_id
    or new.question_text is distinct from old.question_text
    or new.credit_cost is distinct from old.credit_cost
    or new.credit_reward is distinct from old.credit_reward
    or old.status <> 'pending'
    or new.status <> 'answered'
    or new.answer_text is null
  then
    raise exception 'Owners can only answer pending direct questions.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_direct_question_protected_updates on public.direct_questions;
create trigger prevent_direct_question_protected_updates
before update on public.direct_questions
for each row execute function public.prevent_direct_question_protected_updates();

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
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
drop policy if exists "Visible products are public" on public.products;
drop policy if exists "Owned products are public" on public.owned_products;
drop policy if exists "Owner product ratings are public" on public.owner_product_ratings;
drop policy if exists "Questions are public" on public.questions;
drop policy if exists "Answers are public" on public.answers;
drop policy if exists "Buyers can read own direct questions" on public.direct_questions;
drop policy if exists "Owners can read assigned direct questions" on public.direct_questions;
drop policy if exists "Helpful votes are public" on public.answer_helpful_votes;
drop policy if exists "Owner verification photos are public" on storage.objects;
drop policy if exists "Owners can read own verification photos" on storage.objects;
drop policy if exists "Admins can read owner verification photos" on storage.objects;
drop policy if exists "Users can read own profile" on public.profiles;
drop policy if exists "Profiles are public" on public.profiles;
drop policy if exists "Users can create own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
drop policy if exists "Admins can update profiles" on public.profiles;
drop policy if exists "Authenticated users can award trust" on public.profiles;
drop policy if exists "Authenticated users can create products" on public.products;
drop policy if exists "Authenticated users can submit user products" on public.products;
drop policy if exists "Admins can insert products" on public.products;
drop policy if exists "Admin clients can update products" on public.products;
drop policy if exists "Admins can update products" on public.products;
drop policy if exists "Admins can delete products" on public.products;
drop policy if exists "Users can claim owned products" on public.owned_products;
drop policy if exists "Users can update own owned products" on public.owned_products;
drop policy if exists "Users can update own safe ownership fields" on public.owned_products;
drop policy if exists "Admin can review owner verifications" on public.owned_products;
drop policy if exists "Admins can manage owner verifications" on public.owned_products;
drop policy if exists "Owners can create own product ratings" on public.owner_product_ratings;
drop policy if exists "Owners can update own product ratings" on public.owner_product_ratings;
drop policy if exists "Users can ask questions" on public.questions;
drop policy if exists "Users can update questions they asked" on public.questions;
drop policy if exists "Authenticated users can mark questions answered" on public.questions;
drop policy if exists "Admins can update questions" on public.questions;
drop policy if exists "Users can answer questions" on public.answers;
drop policy if exists "Owners can update own answers" on public.answers;
drop policy if exists "Admins can update answers" on public.answers;
drop policy if exists "Buyers can create direct questions" on public.direct_questions;
drop policy if exists "Owners can answer assigned direct questions" on public.direct_questions;
drop policy if exists "Users can mark answers helpful" on public.answer_helpful_votes;
drop policy if exists "Authenticated users can update helpful counts" on public.answers;
drop policy if exists "Users can read own credit transactions" on public.credit_transactions;
drop policy if exists "Users can create own credit transactions" on public.credit_transactions;
drop policy if exists "Users can report content" on public.reports;
drop policy if exists "Users can upload owner verification photos" on storage.objects;
drop policy if exists "Anyone can upload phone verification photos" on storage.objects;
drop policy if exists "Admins can read admin users" on public.admin_users;
drop policy if exists "Admins can manage admin users" on public.admin_users;

-- Admin users are visible only to admins so role membership can be audited safely.
create policy "Admins can read admin users" on public.admin_users for select using (public.is_admin());

-- Admin membership changes are restricted to existing admins.
create policy "Admins can manage admin users" on public.admin_users for all using (public.is_admin()) with check (public.is_admin());

-- Public catalog reads exclude rejected products; admins can see every product.
create policy "Visible products are public" on public.products for select using (
  product_verification_status <> 'rejected' or public.is_admin()
);

-- Authenticated users can submit new products only into the user-submitted review state.
create policy "Authenticated users can submit user products" on public.products for insert with check (
  auth.uid() is not null
  and product_verification_status = 'user_submitted'
  and coalesce(data_source, 'user_submitted') in ('user_submitted', 'user_created')
  and verified_source is null
  and external_product_id is null
  and enrichment_status = 'not_enriched'
);

-- Admins can insert curated/imported products.
create policy "Admins can insert products" on public.products for insert with check (public.is_admin());

-- Only admins can update product catalog, source, image, specs, and enrichment fields.
create policy "Admins can update products" on public.products for update using (public.is_admin()) with check (public.is_admin());

-- Only admins can delete products.
create policy "Admins can delete products" on public.products for delete using (public.is_admin());

-- Ownership claims are public metadata for product pages; verification photo access is handled by storage policies.
create policy "Owned products are public" on public.owned_products for select using (true);

-- Users can create their own basic ownership claim in an unverified/submitted state.
create policy "Users can claim owned products" on public.owned_products for insert with check (
  auth.uid() = user_id
  and verification_status in ('unverified', 'photo_submitted')
);

-- Users can update safe fields on their own ownership claim; protected fields are guarded by trigger.
create policy "Users can update own safe ownership fields" on public.owned_products for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admins can review, approve, reject, and annotate ownership verification.
create policy "Admins can manage owner verifications" on public.owned_products for update using (public.is_admin()) with check (public.is_admin());

-- Owner product scorecards are public aggregate/input data for product pages.
create policy "Owner product ratings are public" on public.owner_product_ratings for select using (true);

-- Claimed owners can create criteria ratings for products they actually own.
create policy "Owners can create own product ratings" on public.owner_product_ratings for insert with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.owned_products
    where owned_products.id = owner_product_ratings.owned_product_id
      and owned_products.user_id = auth.uid()
      and owned_products.product_id = owner_product_ratings.product_id
      and owned_products.verification_status in ('unverified', 'photo_submitted', 'photo_verified', 'receipt_verified', 'trusted_owner')
  )
);

-- Claimed owners can update their own criteria ratings while they still own the product.
create policy "Owners can update own product ratings" on public.owner_product_ratings for update using (auth.uid() = user_id) with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.owned_products
    where owned_products.id = owner_product_ratings.owned_product_id
      and owned_products.user_id = auth.uid()
      and owned_products.product_id = owner_product_ratings.product_id
      and owned_products.verification_status in ('unverified', 'photo_submitted', 'photo_verified', 'receipt_verified', 'trusted_owner')
  )
);

-- Public questions are readable on product pages.
create policy "Questions are public" on public.questions for select using (true);

-- Buyers can ask public questions as themselves or anonymously.
create policy "Users can ask questions" on public.questions for insert with check (auth.uid() = buyer_id or buyer_id is null);

-- Buyers can edit their own question row.
create policy "Users can update questions they asked" on public.questions for update using (auth.uid() = buyer_id);

-- Admins can moderate question state.
create policy "Admins can update questions" on public.questions for update using (public.is_admin()) with check (public.is_admin());

-- Public answers are readable on product pages.
create policy "Answers are public" on public.answers for select using (true);

-- Users can answer public questions as themselves.
create policy "Users can answer questions" on public.answers for insert with check (auth.uid() = owner_id);

-- Answer authors can update their own answer text; helpful counts should move through secure server flows.
create policy "Owners can update own answers" on public.answers for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Admins can moderate answers.
create policy "Admins can update answers" on public.answers for update using (public.is_admin()) with check (public.is_admin());

-- Buyers can read their own private direct questions.
create policy "Buyers can read own direct questions" on public.direct_questions for select using (auth.uid() = buyer_id);

-- Assigned owners can read direct questions sent to them.
create policy "Owners can read assigned direct questions" on public.direct_questions for select using (auth.uid() = owner_id);

-- Buyers can create direct questions with default credit fields only.
create policy "Buyers can create direct questions" on public.direct_questions for insert with check (
  auth.uid() = buyer_id
  and status = 'pending'
  and answer_text is null
  and answered_at is null
  and credit_cost = 25
  and credit_reward = 20
);

-- Assigned owners can only answer pending direct questions; protected fields are guarded by trigger.
create policy "Owners can answer assigned direct questions" on public.direct_questions for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Helpful votes are public count inputs.
create policy "Helpful votes are public" on public.answer_helpful_votes for select using (true);

-- Users can mark answers helpful once.
create policy "Users can mark answers helpful" on public.answer_helpful_votes for insert with check (auth.uid() = user_id);

-- Profiles are public so owner names and trust can render on product pages.
create policy "Profiles are public" on public.profiles for select using (true);

-- Users can create their own profile.
create policy "Users can create own profile" on public.profiles for insert with check (auth.uid() = id);

-- Users can update their own non-reward profile fields; credit/trust changes are guarded by trigger.
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- Admins can update profile reward fields and moderation metadata.
create policy "Admins can update profiles" on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- Users can read only their own credit ledger.
create policy "Users can read own credit transactions" on public.credit_transactions for select using (auth.uid() = user_id);

-- Users can create their own credit transaction records; balance mutation must be handled separately.
create policy "Users can create own credit transactions" on public.credit_transactions for insert with check (auth.uid() = user_id);

-- Users can report content for moderation.
create policy "Users can report content" on public.reports for insert with check (auth.uid() = reporter_id or reporter_id is null);

-- Owners can read their own verification photos.
create policy "Owners can read own verification photos" on storage.objects for select using (
  bucket_id = 'owner-verifications'
  and (
    auth.uid()::text = (storage.foldername(name))[1]
    or (
      (storage.foldername(name))[1] = 'phone-verifications'
      and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
      and exists (
        select 1
        from public.owned_products
        where owned_products.id = ((storage.foldername(name))[2])::uuid
          and owned_products.user_id = auth.uid()
      )
    )
  )
);

-- Admins can read every owner verification photo.
create policy "Admins can read owner verification photos" on storage.objects for select using (
  bucket_id = 'owner-verifications'
  and public.is_admin()
);

-- Owners can upload same-device verification photos into their own folder.
create policy "Users can upload owner verification photos" on storage.objects for insert with check (
  bucket_id = 'owner-verifications'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Phone verification can upload only into the phone-verifications folder; token validation happens in RPC.
create policy "Anyone can upload phone verification photos" on storage.objects for insert with check (
  bucket_id = 'owner-verifications'
  and (storage.foldername(name))[1] = 'phone-verifications'
  and (storage.foldername(name))[2] is not null
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
