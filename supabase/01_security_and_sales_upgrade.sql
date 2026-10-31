-- =====================================================================
--  Soran Hookah Shop — Security & sales upgrade
--  Run ONCE in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run again (idempotent).
--
--  What it does:
--   1. Hashes all staff passwords and PIN codes (bcrypt) and wipes the
--      plain-text copies.
--   2. Locks the staff_users table so the public (anon) key can no longer
--      read passwords. Login / lock-screen / user management now go
--      through secure RPC functions that use a session token.
--   3. Adds process_sale(): one transaction for sale + items + stock +
--      customer debt, with stock decremented on the server (no more
--      wrong stock when two devices sell at the same time).
--   4. Adds adjust_stock(): atomic +/- stock for returns & exchanges.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Hash secrets
-- ---------------------------------------------------------------------
alter table public.staff_users add column if not exists password_hash text;
alter table public.staff_users add column if not exists pin_hash text;

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='staff_users' and column_name='password') then
    execute 'alter table public.staff_users alter column password drop not null';
    execute $q$update public.staff_users
               set password_hash = extensions.crypt(password, extensions.gen_salt('bf'))
               where password is not null and password <> '' $q$;
    execute 'update public.staff_users set password = null';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='staff_users' and column_name='pin_code') then
    execute 'alter table public.staff_users alter column pin_code drop not null';
    execute $q$update public.staff_users
               set pin_hash = extensions.crypt(pin_code, extensions.gen_salt('bf'))
               where pin_code is not null and pin_code <> '' $q$;
    execute 'update public.staff_users set pin_code = null';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Sessions + lock down staff_users
-- ---------------------------------------------------------------------
create table if not exists public.staff_sessions (
  token      uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references public.staff_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

alter table public.staff_users    enable row level security;
alter table public.staff_sessions enable row level security;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies
           where schemaname='public' and tablename in ('staff_users','staff_sessions') loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

revoke all on public.staff_users    from anon, authenticated;
revoke all on public.staff_sessions from anon, authenticated;

-- public view of a staff row (never contains secrets)
create or replace function public._staff_public(s public.staff_users)
returns jsonb language sql stable as $$
  select (to_jsonb(s) - 'password' - 'pin_code' - 'password_hash' - 'pin_hash');
$$;

-- resolve a session token → staff row (or null)
create or replace function public._staff_from_token(p_token uuid)
returns public.staff_users
language sql stable security definer set search_path = public as $$
  select u.* from public.staff_sessions s
  join public.staff_users u on u.id = s.staff_id
  where s.token = p_token and s.expires_at > now()
    and coalesce((to_jsonb(u)->>'is_active')::boolean, true)
  limit 1;
$$;

create or replace function public._staff_require_admin(p_token uuid)
returns public.staff_users
language plpgsql stable security definer set search_path = public as $$
declare u public.staff_users;
begin
  u := public._staff_from_token(p_token);
  if u.id is null then raise exception 'SESSION_INVALID' using errcode = '28000'; end if;
  if u.role::text <> 'Admin' then raise exception 'NOT_ADMIN' using errcode = '42501'; end if;
  return u;
end $$;

-- LOGIN
create or replace function public.staff_login(p_email text, p_password text)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare u public.staff_users; v_token uuid;
begin
  select * into u from public.staff_users
  where lower(email) = lower(trim(p_email))
    and password_hash is not null
    and password_hash = extensions.crypt(p_password, password_hash)
    and coalesce((to_jsonb(staff_users)->>'is_active')::boolean, true)
  limit 1;

  if u.id is null then
    perform pg_sleep(0.6);           -- slow down brute force
    return null;
  end if;

  delete from public.staff_sessions where expires_at < now();
  insert into public.staff_sessions (staff_id) values (u.id) returning token into v_token;
  return public._staff_public(u) || jsonb_build_object('session_token', v_token);
end $$;

-- CURRENT USER (for permission sync)
create or replace function public.staff_me(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u public.staff_users;
begin
  u := public._staff_from_token(p_token);
  if u.id is null then return null; end if;
  return public._staff_public(u);
end $$;

-- LOCK SCREEN: password or PIN
create or replace function public.staff_verify_secret(p_token uuid, p_secret text)
returns boolean
language plpgsql stable security definer set search_path = public, extensions as $$
declare u public.staff_users;
begin
  u := public._staff_from_token(p_token);
  if u.id is null then return false; end if;
  return (u.password_hash is not null and u.password_hash = extensions.crypt(p_secret, u.password_hash))
      or (u.pin_hash      is not null and u.pin_hash      = extensions.crypt(p_secret, u.pin_hash));
end $$;

create or replace function public.staff_logout(p_token uuid)
returns void language sql volatile security definer set search_path = public as $$
  delete from public.staff_sessions where token = p_token;
$$;

-- LIST (any logged-in user; no secrets)
create or replace function public.staff_list(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u public.staff_users;
begin
  u := public._staff_from_token(p_token);
  if u.id is null then raise exception 'SESSION_INVALID' using errcode = '28000'; end if;
  return coalesce((select jsonb_agg(public._staff_public(s) order by s.created_at)
                   from public.staff_users s), '[]'::jsonb);
end $$;

-- CREATE / UPDATE (admin only). Empty password/pin on update = keep old.
create or replace function public.staff_save(
  p_token uuid, p_id uuid, p_name text, p_email text,
  p_password text, p_pin text, p_role text, p_permissions jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare r public.staff_users; v_id uuid;
begin
  perform public._staff_require_admin(p_token);

  -- jsonb_populate_record lets this work whatever the column types are (text/enum, text[]/jsonb)
  r := jsonb_populate_record(null::public.staff_users, jsonb_build_object(
         'name', trim(p_name), 'email', lower(trim(p_email)),
         'role', p_role, 'permissions', coalesce(p_permissions, '[]'::jsonb)));

  if p_id is null then
    if coalesce(p_password,'') = '' or coalesce(p_pin,'') = '' then
      raise exception 'PASSWORD_AND_PIN_REQUIRED';
    end if;
    insert into public.staff_users (name, email, role, permissions, password_hash, pin_hash)
    values (r.name, r.email, r.role, r.permissions,
            extensions.crypt(p_password, extensions.gen_salt('bf')),
            extensions.crypt(p_pin,      extensions.gen_salt('bf')))
    returning id into v_id;
  else
    update public.staff_users set
      name = r.name, email = r.email, role = r.role, permissions = r.permissions,
      password_hash = case when coalesce(p_password,'') <> ''
                           then extensions.crypt(p_password, extensions.gen_salt('bf')) else password_hash end,
      pin_hash      = case when coalesce(p_pin,'') <> ''
                           then extensions.crypt(p_pin, extensions.gen_salt('bf')) else pin_hash end
    where id = p_id
    returning id into v_id;
    -- password changed → sign that user out everywhere
    if coalesce(p_password,'') <> '' then
      delete from public.staff_sessions where staff_id = p_id and token <> p_token;
    end if;
  end if;
  return jsonb_build_object('id', v_id);
end $$;

create or replace function public.staff_delete(p_token uuid, p_id uuid)
returns void
language plpgsql volatile security definer set search_path = public as $$
declare me public.staff_users;
begin
  me := public._staff_require_admin(p_token);
  if me.id = p_id then raise exception 'CANNOT_DELETE_SELF'; end if;
  if (select count(*) from public.staff_users) <= 1 then raise exception 'LAST_USER'; end if;
  delete from public.staff_users where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- 3. Atomic sale
-- ---------------------------------------------------------------------
-- p_sale  : {total_amount,total_profit,payment_method,payment_amount,debt_customer_id,discount}
-- p_items : [{product_id,name,quantity,price,cost}]
-- p_stock : [{id, qty}]   qty = pieces to deduct
create or replace function public.process_sale(
  p_sale jsonb, p_items jsonb, p_stock jsonb,
  p_customer_id text default null, p_debt_amount numeric default 0)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_sale jsonb; v_sid public.sale_items.sale_id%type;
begin
  insert into public.sales (total_amount,total_profit,payment_method,payment_amount,debt_customer_id,discount)
  select total_amount,total_profit,payment_method,payment_amount,debt_customer_id,discount
  from jsonb_populate_record(null::public.sales, p_sale)
  returning to_jsonb(sales.*) into v_sale;

  v_sid := v_sale->>'id';

  insert into public.sale_items (sale_id, product_id, name, quantity, price, cost)
  select v_sid, x.product_id, x.name, x.quantity, x.price, x.cost
  from jsonb_populate_recordset(null::public.sale_items, p_items) x;

  update public.products p
     set stock_level = p.stock_level - (e->>'qty')::numeric
    from jsonb_array_elements(coalesce(p_stock,'[]'::jsonb)) e
   where p.id::text = e->>'id';

  if p_customer_id is not null and coalesce(p_debt_amount,0) <> 0 then
    update public.customers
       set total_purchases = coalesce(total_purchases,0) + p_debt_amount,
           remaining_debt  = coalesce(remaining_debt,0)  + p_debt_amount
     where id::text = p_customer_id;
  end if;

  return v_sale;
end $$;

-- ---------------------------------------------------------------------
-- 4. Atomic stock adjust  p_changes: [{id, delta}]  (delta may be negative)
-- ---------------------------------------------------------------------
create or replace function public.adjust_stock(p_changes jsonb, p_floor_zero boolean default false)
returns void
language sql volatile security definer set search_path = public as $$
  update public.products p
     set stock_level = case when p_floor_zero
                            then greatest(0, p.stock_level + (e->>'delta')::numeric)
                            else p.stock_level + (e->>'delta')::numeric end
    from jsonb_array_elements(coalesce(p_changes,'[]'::jsonb)) e
   where p.id::text = e->>'id';
$$;

-- ---------------------------------------------------------------------
-- Permissions for the app's public key
-- ---------------------------------------------------------------------
revoke all on function public._staff_from_token(uuid)    from public, anon, authenticated;
revoke all on function public._staff_require_admin(uuid) from public, anon, authenticated;
revoke all on function public._staff_public(public.staff_users) from public, anon, authenticated;

grant execute on function public.staff_login(text, text)              to anon, authenticated;
grant execute on function public.staff_me(uuid)                       to anon, authenticated;
grant execute on function public.staff_verify_secret(uuid, text)      to anon, authenticated;
grant execute on function public.staff_logout(uuid)                   to anon, authenticated;
grant execute on function public.staff_list(uuid)                     to anon, authenticated;
grant execute on function public.staff_save(uuid, uuid, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.staff_delete(uuid, uuid)             to anon, authenticated;
grant execute on function public.process_sale(jsonb, jsonb, jsonb, text, numeric) to anon, authenticated;
grant execute on function public.adjust_stock(jsonb, boolean)         to anon, authenticated;

notify pgrst, 'reload schema';
