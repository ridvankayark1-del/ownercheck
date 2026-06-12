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
  chat_id uuid,
  question_text text not null,
  answer_text text,
  status text not null default 'pending',
  credit_cost integer not null default 25,
  credit_reward integer not null default 20,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  declined_at timestamptz,
  answered_at timestamptz
);

alter table public.direct_questions
  add column if not exists chat_id uuid,
  add column if not exists accepted_at timestamptz,
  add column if not exists declined_at timestamptz;

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  direct_question_id uuid unique references public.direct_questions(id) on delete set null,
  product_id uuid references public.products(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chats_status_check'
      and conrelid = 'public.chats'::regclass
  ) then
    alter table public.chats
      add constraint chats_status_check check (status in ('open', 'closed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'direct_questions_chat_id_fkey'
      and conrelid = 'public.direct_questions'::regclass
  ) then
    alter table public.direct_questions
      add constraint direct_questions_chat_id_fkey
      foreign key (chat_id) references public.chats(id) on delete set null;
  end if;
end $$;

create table if not exists public.chat_participants (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_participants_role_check'
      and conrelid = 'public.chat_participants'::regclass
  ) then
    alter table public.chat_participants
      add constraint chat_participants_role_check check (role in ('buyer', 'owner'));
  end if;
end $$;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message_text text not null,
  created_at timestamptz not null default now()
);

alter table public.questions
  add column if not exists winning_owner_id uuid references public.profiles(id) on delete set null,
  add column if not exists winning_answer_id uuid,
  add column if not exists answered_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'questions_winning_answer_id_fkey'
      and conrelid = 'public.questions'::regclass
  ) then
    alter table public.questions
      add constraint questions_winning_answer_id_fkey
      foreign key (winning_answer_id) references public.answers(id) on delete set null;
  end if;
end $$;

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
      check (status in ('pending', 'accepted', 'declined', 'answered'));
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'direct_questions_status_check'
      and conrelid = 'public.direct_questions'::regclass
  ) then
    alter table public.direct_questions
      drop constraint direct_questions_status_check;
  end if;

  alter table public.direct_questions
    add constraint direct_questions_status_check
    check (status in ('pending', 'accepted', 'declined', 'answered'));
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
  if public.is_admin()
    or current_setting('ownercheck.secure_credit_flow', true) = 'on'
  then
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
  if public.is_admin()
    or current_setting('ownercheck.secure_credit_flow', true) = 'on'
  then
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
  if public.is_admin()
    or current_setting('ownercheck.secure_credit_flow', true) = 'on'
  then
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
  if public.is_admin()
    or current_setting('ownercheck.secure_credit_flow', true) = 'on'
  then
    return new;
  end if;

  raise exception 'Direct requests can only be changed through secure server flows.';

  return new;
end;
$$;

drop trigger if exists prevent_direct_question_protected_updates on public.direct_questions;
create trigger prevent_direct_question_protected_updates
before update on public.direct_questions
for each row execute function public.prevent_direct_question_protected_updates();

create or replace function public.create_public_question(
  product_id_input uuid,
  question_text_input text
)
returns public.questions
language plpgsql
security definer
set search_path = public
as $$
declare
  asker_id_value uuid := auth.uid();
  asker_credits integer;
  created_question public.questions;
begin
  if asker_id_value is null then
    raise exception 'Log in to ask a public question.';
  end if;

  if nullif(trim(question_text_input), '') is null then
    raise exception 'Write a question first.';
  end if;

  select credit_balance
  into asker_credits
  from public.profiles
  where id = asker_id_value
  for update;

  if not found then
    raise exception 'Could not load your credits.';
  end if;

  if asker_credits < 10 then
    raise exception 'You need at least 10 credits to ask a question.';
  end if;

  perform set_config('ownercheck.secure_credit_flow', 'on', true);

  insert into public.questions (
    product_id,
    buyer_id,
    question_text,
    credit_reward,
    status
  )
  values (
    product_id_input,
    asker_id_value,
    trim(question_text_input),
    10,
    'open'
  )
  returning * into created_question;

  update public.profiles
  set credit_balance = credit_balance - 10
  where id = asker_id_value;

  insert into public.credit_transactions (
    user_id,
    amount,
    reason,
    related_question_id
  )
  values (
    asker_id_value,
    -10,
    'Asked a public product question',
    created_question.id
  );

  return created_question;
end;
$$;

grant execute on function public.create_public_question(uuid, text) to authenticated;

create or replace function public.answer_public_question(
  question_id_input uuid,
  answer_text_input text
)
returns public.answers
language plpgsql
security definer
set search_path = public
as $$
declare
  answering_owner_id uuid := auth.uid();
  question_record public.questions;
  owner_claim public.owned_products;
  created_answer public.answers;
  reward_amount integer;
begin
  if answering_owner_id is null then
    raise exception 'Log in to answer this question.';
  end if;

  if nullif(trim(answer_text_input), '') is null then
    raise exception 'Write an answer first.';
  end if;

  select *
  into question_record
  from public.questions
  where id = question_id_input
  for update;

  if not found then
    raise exception 'Question not found.';
  end if;

  if question_record.buyer_id = answering_owner_id then
    raise exception 'You cannot answer your own question.';
  end if;

  if question_record.status <> 'open'
    or question_record.winning_owner_id is not null
    or question_record.winning_answer_id is not null
  then
    raise exception 'This question was already answered.';
  end if;

  select *
  into owner_claim
  from public.owned_products
  where product_id = question_record.product_id
    and user_id = answering_owner_id
    and verification_status in ('photo_verified', 'receipt_verified', 'trusted_owner')
  order by created_at asc
  limit 1;

  if not found then
    raise exception 'Only verified owners of this product can answer.';
  end if;

  reward_amount := coalesce(question_record.credit_reward, 10);
  perform set_config('ownercheck.secure_credit_flow', 'on', true);

  insert into public.answers (
    question_id,
    owned_product_id,
    owner_id,
    answer_text,
    helpful_count
  )
  values (
    question_record.id,
    owner_claim.id,
    answering_owner_id,
    trim(answer_text_input),
    0
  )
  returning * into created_answer;

  update public.questions
  set
    winning_owner_id = answering_owner_id,
    winning_answer_id = created_answer.id,
    status = 'answered',
    answered_at = now()
  where id = question_record.id
    and status = 'open'
    and winning_owner_id is null
    and winning_answer_id is null;

  if not found then
    raise exception 'This question was already answered.';
  end if;

  update public.profiles
  set
    credit_balance = credit_balance + reward_amount,
    trust_score = trust_score + 1
  where id = answering_owner_id;

  insert into public.credit_transactions (
    user_id,
    amount,
    reason,
    related_question_id,
    related_answer_id
  )
  values (
    answering_owner_id,
    reward_amount,
    'Answered a public product question',
    question_record.id,
    created_answer.id
  );

  return created_answer;
exception
  when unique_violation then
    raise exception 'You already answered this question.';
end;
$$;

grant execute on function public.answer_public_question(uuid, text) to authenticated;

drop function if exists public.create_direct_question(uuid, text);

create or replace function public.create_direct_question(
  product_id_input uuid,
  selected_owner_id_input uuid,
  question_text_input text
)
returns public.direct_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  buyer_id_value uuid := auth.uid();
  buyer_credits integer;
  selected_owner_claim public.owned_products;
  created_question public.direct_questions;
begin
  if buyer_id_value is null then
    raise exception 'Log in to ask an owner directly.';
  end if;

  if nullif(trim(question_text_input), '') is null then
    raise exception 'Write a direct question first.';
  end if;

  select credit_balance
  into buyer_credits
  from public.profiles
  where id = buyer_id_value
  for update;

  if not found then
    raise exception 'Could not load your credits.';
  end if;

  if buyer_credits < 25 then
    raise exception 'You need at least 25 credits to ask an owner directly.';
  end if;

  if selected_owner_id_input is null then
    raise exception 'Choose an owner to contact.';
  end if;

  if selected_owner_id_input = buyer_id_value then
    raise exception 'You cannot start a direct request with yourself.';
  end if;

  select *
  into selected_owner_claim
  from public.owned_products
  where owned_products.product_id = product_id_input
    and owned_products.user_id = selected_owner_id_input
    and owned_products.verification_status in ('photo_verified', 'receipt_verified', 'trusted_owner')
  order by owned_products.created_at asc
  limit 1;

  if not found then
    raise exception 'Choose a verified owner of this product.';
  end if;

  perform set_config('ownercheck.secure_credit_flow', 'on', true);

  insert into public.direct_questions (
    product_id,
    buyer_id,
    owner_id,
    question_text,
    status,
    credit_cost,
    credit_reward
  )
  values (
    product_id_input,
    buyer_id_value,
    selected_owner_id_input,
    trim(question_text_input),
    'pending',
    25,
    20
  )
  returning * into created_question;

  update public.profiles
  set credit_balance = credit_balance - 25
  where id = buyer_id_value;

  insert into public.credit_transactions (
    user_id,
    amount,
    reason
  )
  values (
    buyer_id_value,
    -25,
    'Asked an owner directly'
  );

  return created_question;
end;
$$;

grant execute on function public.create_direct_question(uuid, uuid, text) to authenticated;

drop function if exists public.answer_direct_question(uuid, text);

create or replace function public.accept_direct_question(
  direct_question_id_input uuid
)
returns public.chats
language plpgsql
security definer
set search_path = public
as $$
declare
  accepting_owner_id uuid := auth.uid();
  question_record public.direct_questions;
  created_chat public.chats;
begin
  if accepting_owner_id is null then
    raise exception 'Log in to accept this direct request.';
  end if;

  select *
  into question_record
  from public.direct_questions
  where id = direct_question_id_input
  for update;

  if not found then
    raise exception 'Direct request not found.';
  end if;

  if question_record.owner_id <> accepting_owner_id then
    raise exception 'Only the selected owner can accept this direct request.';
  end if;

  if question_record.status = 'declined' then
    raise exception 'This direct request was declined.';
  end if;

  if question_record.status in ('accepted', 'answered')
    and question_record.chat_id is not null
  then
    select *
    into created_chat
    from public.chats
    where id = question_record.chat_id;

    if found then
      return created_chat;
    end if;
  end if;

  perform set_config('ownercheck.secure_credit_flow', 'on', true);

  insert into public.chats (
    direct_question_id,
    product_id,
    buyer_id,
    owner_id
  )
  values (
    question_record.id,
    question_record.product_id,
    question_record.buyer_id,
    question_record.owner_id
  )
  on conflict (direct_question_id) do update
  set updated_at = public.chats.updated_at
  returning * into created_chat;

  insert into public.chat_participants (chat_id, user_id, role)
  values
    (created_chat.id, question_record.buyer_id, 'buyer'),
    (created_chat.id, question_record.owner_id, 'owner')
  on conflict (chat_id, user_id) do nothing;

  insert into public.chat_messages (chat_id, sender_id, message_text)
  select created_chat.id, question_record.buyer_id, question_record.question_text
  where not exists (
    select 1
    from public.chat_messages
    where chat_messages.chat_id = created_chat.id
  );

  update public.direct_questions
  set
    chat_id = created_chat.id,
    status = 'accepted',
    accepted_at = coalesce(accepted_at, now())
  where id = question_record.id;

  return created_chat;
end;
$$;

grant execute on function public.accept_direct_question(uuid) to authenticated;

create or replace function public.decline_direct_question(
  direct_question_id_input uuid
)
returns public.direct_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  declining_owner_id uuid := auth.uid();
  question_record public.direct_questions;
begin
  if declining_owner_id is null then
    raise exception 'Log in to decline this direct request.';
  end if;

  select *
  into question_record
  from public.direct_questions
  where id = direct_question_id_input
  for update;

  if not found then
    raise exception 'Direct request not found.';
  end if;

  if question_record.owner_id <> declining_owner_id then
    raise exception 'Only the selected owner can decline this direct request.';
  end if;

  if question_record.status <> 'pending' then
    raise exception 'Only pending direct requests can be declined.';
  end if;

  perform set_config('ownercheck.secure_credit_flow', 'on', true);

  update public.direct_questions
  set
    status = 'declined',
    declined_at = now()
  where id = question_record.id
    and status = 'pending'
    and chat_id is null
  returning * into question_record;

  if not found then
    raise exception 'This direct request is no longer pending.';
  end if;

  return question_record;
end;
$$;

grant execute on function public.decline_direct_question(uuid) to authenticated;

create or replace function public.send_chat_message(
  chat_id_input uuid,
  message_text_input text
)
returns public.chat_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_id_value uuid := auth.uid();
  created_message public.chat_messages;
begin
  if sender_id_value is null then
    raise exception 'Log in to send a chat message.';
  end if;

  if nullif(trim(message_text_input), '') is null then
    raise exception 'Write a message first.';
  end if;

  if not exists (
    select 1
    from public.chat_participants
    where chat_participants.chat_id = chat_id_input
      and chat_participants.user_id = sender_id_value
  ) then
    raise exception 'You cannot send messages in this chat.';
  end if;

  perform set_config('ownercheck.secure_credit_flow', 'on', true);

  insert into public.chat_messages (chat_id, sender_id, message_text)
  values (chat_id_input, sender_id_value, trim(message_text_input))
  returning * into created_message;

  update public.chats
  set updated_at = now()
  where id = chat_id_input;

  return created_message;
end;
$$;

grant execute on function public.send_chat_message(uuid, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.products enable row level security;
alter table public.owned_products enable row level security;
alter table public.owner_product_ratings enable row level security;
alter table public.questions enable row level security;
alter table public.answers enable row level security;
alter table public.direct_questions enable row level security;
alter table public.chats enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;
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
drop policy if exists "Verified owners can read product direct questions" on public.direct_questions;
drop policy if exists "Selected owners can read assigned direct questions" on public.direct_questions;
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
drop policy if exists "Public question inserts require secure RPC" on public.questions;
drop policy if exists "Users can update questions they asked" on public.questions;
drop policy if exists "Authenticated users can mark questions answered" on public.questions;
drop policy if exists "Admins can update questions" on public.questions;
drop policy if exists "Users can answer questions" on public.answers;
drop policy if exists "Public answer inserts require secure RPC" on public.answers;
drop policy if exists "Owners can update own answers" on public.answers;
drop policy if exists "Admins can update answers" on public.answers;
drop policy if exists "Buyers can create direct questions" on public.direct_questions;
drop policy if exists "Direct question inserts require secure RPC" on public.direct_questions;
drop policy if exists "Owners can answer assigned direct questions" on public.direct_questions;
drop policy if exists "Direct question updates require secure RPC" on public.direct_questions;
drop policy if exists "Participants can read own chats" on public.chats;
drop policy if exists "Chat inserts require secure RPC" on public.chats;
drop policy if exists "Chat updates require secure RPC" on public.chats;
drop policy if exists "Participants can read own chat participants" on public.chat_participants;
drop policy if exists "Chat participant inserts require secure RPC" on public.chat_participants;
drop policy if exists "Participants can read own chat messages" on public.chat_messages;
drop policy if exists "Chat message inserts require secure RPC" on public.chat_messages;
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

-- Public question creation must use create_public_question so credits are
-- deducted atomically.
create policy "Public question inserts require secure RPC" on public.questions for insert with check (false);

-- Buyers can edit their own question row.
create policy "Users can update questions they asked" on public.questions for update using (auth.uid() = buyer_id);

-- Admins can moderate question state.
create policy "Admins can update questions" on public.questions for update using (public.is_admin()) with check (public.is_admin());

-- Public answers are readable on product pages.
create policy "Answers are public" on public.answers for select using (true);

-- Public answers must use answer_public_question so first-winner and reward
-- logic is atomic.
create policy "Public answer inserts require secure RPC" on public.answers for insert with check (false);

-- Answer authors can update their own answer text; helpful counts should move through secure server flows.
create policy "Owners can update own answers" on public.answers for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- Admins can moderate answers.
create policy "Admins can update answers" on public.answers for update using (public.is_admin()) with check (public.is_admin());

-- Buyers can read their own private direct questions.
create policy "Buyers can read own direct questions" on public.direct_questions for select using (auth.uid() = buyer_id);

-- Selected owners can read private directs sent to them.
create policy "Selected owners can read assigned direct questions" on public.direct_questions for select using (auth.uid() = owner_id);

-- Direct question inserts must use create_direct_question so credits are deducted atomically.
create policy "Direct question inserts require secure RPC" on public.direct_questions for insert with check (false);

-- Direct request state changes must use accept_direct_question and
-- decline_direct_question so private chat creation stays atomic.
create policy "Direct question updates require secure RPC" on public.direct_questions for update using (false) with check (false);

-- Private chats are visible only to their two participants.
create policy "Participants can read own chats" on public.chats for select using (
  auth.uid() = buyer_id or auth.uid() = owner_id
);

create policy "Chat inserts require secure RPC" on public.chats for insert with check (false);
create policy "Chat updates require secure RPC" on public.chats for update using (false) with check (false);

create policy "Participants can read own chat participants" on public.chat_participants for select using (
  exists (
    select 1
    from public.chats
    where chats.id = chat_participants.chat_id
      and (chats.buyer_id = auth.uid() or chats.owner_id = auth.uid())
  )
);

create policy "Chat participant inserts require secure RPC" on public.chat_participants for insert with check (false);

create policy "Participants can read own chat messages" on public.chat_messages for select using (
  exists (
    select 1
    from public.chats
    where chats.id = chat_messages.chat_id
      and (chats.buyer_id = auth.uid() or chats.owner_id = auth.uid())
  )
);

create policy "Chat message inserts require secure RPC" on public.chat_messages for insert with check (false);

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
