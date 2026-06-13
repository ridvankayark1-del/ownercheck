drop function if exists public.create_direct_chat_transaction(uuid, uuid, uuid, text, integer);

create or replace function public.create_direct_chat_transaction(
  p_buyer_id uuid,
  p_owner_id uuid,
  p_product_id uuid,
  p_initial_message text,
  p_cost integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  buyer_credits integer;
  created_chat_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Log in to start a private chat.';
  end if;

  if p_buyer_id is distinct from auth.uid() then
    raise exception 'Buyer does not match the authenticated user.';
  end if;

  if p_owner_id is null then
    raise exception 'Choose an owner to contact.';
  end if;

  if p_owner_id = p_buyer_id then
    raise exception 'You cannot start a private chat with yourself.';
  end if;

  if p_product_id is null then
    raise exception 'Choose a product first.';
  end if;

  if coalesce(p_cost, 0) <= 0 then
    raise exception 'Invalid chat cost.';
  end if;

  if nullif(trim(p_initial_message), '') is null then
    raise exception 'Write a private chat message first.';
  end if;

  if not exists (
    select 1
    from public.owned_products
    where owned_products.product_id = p_product_id
      and owned_products.user_id = p_owner_id
      and owned_products.verification_status in ('photo_verified', 'receipt_verified', 'trusted_owner')
  ) then
    raise exception 'Choose a verified owner of this product.';
  end if;

  select credit_balance
  into buyer_credits
  from public.profiles
  where id = p_buyer_id
  for update;

  if not found then
    raise exception 'Could not load your credits.';
  end if;

  if buyer_credits < p_cost then
    raise exception 'Insufficient credits.';
  end if;

  perform set_config('ownercheck.secure_credit_flow', 'on', true);

  update public.profiles
  set credit_balance = credit_balance - p_cost
  where id = p_buyer_id;

  insert into public.credit_transactions (
    user_id,
    amount,
    reason
  )
  values (
    p_buyer_id,
    -p_cost,
    'Started a private chat'
  );

  insert into public.chats (
    product_id,
    buyer_id,
    owner_id
  )
  values (
    p_product_id,
    p_buyer_id,
    p_owner_id
  )
  returning id into created_chat_id;

  insert into public.chat_participants (chat_id, user_id, role)
  values
    (created_chat_id, p_buyer_id, 'buyer'),
    (created_chat_id, p_owner_id, 'owner');

  insert into public.chat_messages (chat_id, sender_id, message_text)
  values (created_chat_id, p_buyer_id, trim(p_initial_message));

  return created_chat_id;
end;
$$;

grant execute on function public.create_direct_chat_transaction(uuid, uuid, uuid, text, integer) to authenticated;
