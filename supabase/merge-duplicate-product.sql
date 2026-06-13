alter table public.products
  add column if not exists canonical_id uuid references public.products(id) on delete set null;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'products'
      and constraint_name = 'products_product_verification_status_check'
  ) then
    alter table public.products
      drop constraint products_product_verification_status_check;
  end if;

  alter table public.products
    add constraint products_product_verification_status_check
    check (
      product_verification_status in (
        'catalog_verified',
        'community_created',
        'user_submitted',
        'pending_enrichment',
        'needs_review',
        'rejected',
        'duplicate'
      )
    );
end $$;

drop function if exists public.merge_duplicate_product(uuid, uuid);

create or replace function public.merge_duplicate_product(
  p_canonical_id uuid,
  p_duplicate_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can merge products.';
  end if;

  if p_canonical_id is null or p_duplicate_id is null then
    raise exception 'Choose both a canonical product and a duplicate product.';
  end if;

  if p_canonical_id = p_duplicate_id then
    raise exception 'Canonical and duplicate products must be different.';
  end if;

  if not exists (select 1 from public.products where id = p_canonical_id) then
    raise exception 'Canonical product does not exist.';
  end if;

  if not exists (select 1 from public.products where id = p_duplicate_id) then
    raise exception 'Duplicate product does not exist.';
  end if;

  if exists (
    select 1
    from public.products
    where id = p_canonical_id
      and product_verification_status = 'duplicate'
  ) then
    raise exception 'Cannot merge into a product already marked as duplicate.';
  end if;

  update public.questions
  set product_id = p_canonical_id
  where product_id = p_duplicate_id;

  update public.direct_questions
  set product_id = p_canonical_id
  where product_id = p_duplicate_id;

  update public.chats
  set
    product_id = p_canonical_id,
    updated_at = now()
  where product_id = p_duplicate_id;

  update public.product_submissions
  set
    linked_product_id = p_canonical_id,
    status = case
      when status = 'approved' then 'duplicate'
      else status
    end,
    reviewed_at = coalesce(reviewed_at, now())
  where linked_product_id = p_duplicate_id;

  update public.product_import_rows
  set
    linked_product_id = case
      when linked_product_id = p_duplicate_id then p_canonical_id
      else linked_product_id
    end,
    created_product_id = case
      when created_product_id = p_duplicate_id then p_canonical_id
      else created_product_id
    end,
    updated_at = now()
  where linked_product_id = p_duplicate_id
     or created_product_id = p_duplicate_id;

  with duplicate_claims as (
    select
      duplicate_claim.id as duplicate_owned_id,
      canonical_claim.id as canonical_owned_id
    from public.owned_products duplicate_claim
    join public.owned_products canonical_claim
      on canonical_claim.user_id = duplicate_claim.user_id
     and canonical_claim.product_id = p_canonical_id
    where duplicate_claim.product_id = p_duplicate_id
  )
  update public.answers
  set owned_product_id = duplicate_claims.canonical_owned_id
  from duplicate_claims
  where answers.owned_product_id = duplicate_claims.duplicate_owned_id;

  with duplicate_claims as (
    select
      duplicate_claim.id as duplicate_owned_id,
      canonical_claim.id as canonical_owned_id
    from public.owned_products duplicate_claim
    join public.owned_products canonical_claim
      on canonical_claim.user_id = duplicate_claim.user_id
     and canonical_claim.product_id = p_canonical_id
    where duplicate_claim.product_id = p_duplicate_id
  )
  delete from public.owner_product_ratings rating
  using duplicate_claims
  where rating.owned_product_id = duplicate_claims.duplicate_owned_id
    and exists (
      select 1
      from public.owner_product_ratings canonical_rating
      where canonical_rating.user_id = rating.user_id
        and canonical_rating.product_id = p_canonical_id
    );

  with duplicate_claims as (
    select
      duplicate_claim.id as duplicate_owned_id,
      canonical_claim.id as canonical_owned_id
    from public.owned_products duplicate_claim
    join public.owned_products canonical_claim
      on canonical_claim.user_id = duplicate_claim.user_id
     and canonical_claim.product_id = p_canonical_id
    where duplicate_claim.product_id = p_duplicate_id
  )
  update public.owner_product_ratings rating
  set
    product_id = p_canonical_id,
    owned_product_id = duplicate_claims.canonical_owned_id,
    updated_at = now()
  from duplicate_claims
  where rating.owned_product_id = duplicate_claims.duplicate_owned_id;

  delete from public.owned_products duplicate_claim
  where duplicate_claim.product_id = p_duplicate_id
    and exists (
      select 1
      from public.owned_products canonical_claim
      where canonical_claim.user_id = duplicate_claim.user_id
        and canonical_claim.product_id = p_canonical_id
    );

  delete from public.owner_product_ratings duplicate_rating
  where duplicate_rating.product_id = p_duplicate_id
    and exists (
      select 1
      from public.owner_product_ratings canonical_rating
      where canonical_rating.user_id = duplicate_rating.user_id
        and canonical_rating.product_id = p_canonical_id
    );

  update public.owned_products
  set product_id = p_canonical_id
  where product_id = p_duplicate_id;

  update public.owner_product_ratings
  set
    product_id = p_canonical_id,
    updated_at = now()
  where product_id = p_duplicate_id;

  update public.products
  set
    product_verification_status = 'duplicate',
    canonical_id = p_canonical_id,
    duplicate_of_product_id = p_canonical_id,
    duplicate_reviewed_at = coalesce(duplicate_reviewed_at, now())
  where id = p_duplicate_id;
end;
$$;

grant execute on function public.merge_duplicate_product(uuid, uuid) to authenticated;
