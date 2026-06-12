-- Test login seed for OwnerCheck.
-- Run this in the Supabase SQL Editor after the main schema/upgrade SQL.
-- It creates confirmed email/password auth users, matching profiles, and an admin grant.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists email text;

do $$
declare
  buyer_id uuid := '11111111-1111-4111-8111-111111111111';
  owner_id uuid := '22222222-2222-4222-8222-222222222222';
  admin_id uuid := '33333333-3333-4333-8333-333333333333';
  test_password text := 'OwnerCheckTest!2026';
begin
  perform set_config('ownercheck.secure_credit_flow', 'on', true);

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    invited_at,
    confirmation_token,
    confirmation_sent_at,
    recovery_token,
    recovery_sent_at,
    email_change_token_new,
    email_change,
    email_change_sent_at,
    last_sign_in_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    created_at,
    updated_at,
    phone,
    phone_confirmed_at,
    phone_change,
    phone_change_token,
    phone_change_sent_at,
    email_change_token_current,
    email_change_confirm_status,
    banned_until,
    reauthentication_token,
    reauthentication_sent_at
  )
  values
    (
      '00000000-0000-0000-0000-000000000000',
      buyer_id,
      'authenticated',
      'authenticated',
      'buyer@ownercheck.dev',
      crypt(test_password, gen_salt('bf')),
      now(),
      null,
      '',
      null,
      '',
      null,
      '',
      '',
      null,
      null,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Test Buyer"}'::jsonb,
      null,
      now(),
      now(),
      null,
      null,
      '',
      '',
      null,
      '',
      0,
      null,
      '',
      null
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      owner_id,
      'authenticated',
      'authenticated',
      'owner@ownercheck.dev',
      crypt(test_password, gen_salt('bf')),
      now(),
      null,
      '',
      null,
      '',
      null,
      '',
      '',
      null,
      null,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Test Owner"}'::jsonb,
      null,
      now(),
      now(),
      null,
      null,
      '',
      '',
      null,
      '',
      0,
      null,
      '',
      null
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      admin_id,
      'authenticated',
      'authenticated',
      'admin@ownercheck.dev',
      crypt(test_password, gen_salt('bf')),
      now(),
      null,
      '',
      null,
      '',
      null,
      '',
      '',
      null,
      null,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Test Admin"}'::jsonb,
      null,
      now(),
      now(),
      null,
      null,
      '',
      '',
      null,
      '',
      0,
      null,
      '',
      null
    )
  on conflict (id) do update
  set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = now(),
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = now();

  insert into auth.identities (
    id,
    provider_id,
    user_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values
    (
      gen_random_uuid(),
      buyer_id::text,
      buyer_id,
      jsonb_build_object('sub', buyer_id::text, 'email', 'buyer@ownercheck.dev', 'email_verified', true),
      'email',
      null,
      now(),
      now()
    ),
    (
      gen_random_uuid(),
      owner_id::text,
      owner_id,
      jsonb_build_object('sub', owner_id::text, 'email', 'owner@ownercheck.dev', 'email_verified', true),
      'email',
      null,
      now(),
      now()
    ),
    (
      gen_random_uuid(),
      admin_id::text,
      admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', 'admin@ownercheck.dev', 'email_verified', true),
      'email',
      null,
      now(),
      now()
    )
  on conflict (provider, provider_id) do update
  set
    user_id = excluded.user_id,
    identity_data = excluded.identity_data,
    updated_at = now();

  insert into public.profiles (
    id,
    email,
    display_name,
    credit_balance,
    trust_score
  )
  values
    (buyer_id, 'buyer@ownercheck.dev', 'Test Buyer', 500, 0),
    (owner_id, 'owner@ownercheck.dev', 'Test Owner', 500, 50),
    (admin_id, 'admin@ownercheck.dev', 'Test Admin', 500, 100)
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = excluded.display_name,
    credit_balance = excluded.credit_balance,
    trust_score = excluded.trust_score;

  insert into public.admin_users (
    user_id,
    email,
    active
  )
  values (
    admin_id,
    'admin@ownercheck.dev',
    true
  )
  on conflict (email) do update
  set
    user_id = excluded.user_id,
    active = true;
end $$;
