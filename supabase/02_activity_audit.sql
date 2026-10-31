-- =====================================================================
--  Soran Hookah Shop — Full activity log (audit trail)
--  Run AFTER 01_security_and_sales_upgrade.sql, once, in SQL Editor.
--  Safe to run again.
--
--  Every INSERT / UPDATE / DELETE on the shop's tables is written to
--  activity_logs automatically — by whom, what, and old → new values.
--  Works for every screen (also future ones); nothing can be changed
--  without leaving a trace. A failing log never blocks the real change.
-- =====================================================================

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  user_name text not null,
  action text not null,
  details text not null,
  metadata jsonb,
  created_at timestamptz default now()
);
create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
create index if not exists activity_logs_action_idx on public.activity_logs (action);

-- ---------------------------------------------------------------------
-- Who is doing this? (session token sent by the app in x-staff-token)
-- ---------------------------------------------------------------------
create or replace function public._audit_actor(out actor_id uuid, out actor_name text)
language plpgsql stable security definer set search_path = public as $$
declare v_tok text;
begin
  begin
    v_tok := nullif(current_setting('request.headers', true), '')::json->>'x-staff-token';
  exception when others then v_tok := null;
  end;
  if v_tok ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id, u.name into actor_id, actor_name
    from public.staff_sessions s join public.staff_users u on u.id = s.staff_id
    where s.token = v_tok::uuid;
  end if;
  if actor_name is null then
    actor_name := case when current_user in ('postgres','supabase_admin') then 'داتابەیس (ڕاستەوخۆ)' else 'نەناسراو' end;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Helpers: labels and value formatting
-- ---------------------------------------------------------------------
create or replace function public._audit_label(k text) returns text
language sql immutable as $$
  select coalesce(('{"name": "ناو", "selling_price": "نرخی فرۆشتن", "cost_price": "تێچوو", "bulk_price": "نرخی تەک", "bulk_cost": "تێچووی تەک", "half_bulk_price": "نرخی نیو تەک", "half_bulk_cost": "تێچووی نیو تەک", "stock_level": "مەوجوود", "min_stock_alert": "ئاگاداری کەمی", "category": "جۆر", "company": "کۆمپانیا", "barcode": "بارکۆد", "bulk_barcode": "بارکۆدی تەک", "section": "بەش", "bulk_size": "قەبارەی تەک", "expiry_date": "بەسەرچوون", "currency": "دراو", "cost_currency": "دراوی تێچوو", "phone": "مۆبایل", "amount": "بڕ", "notes": "تێبینی", "date": "بەروار", "total_amount": "کۆی گشتی", "total_profit": "قازانج", "discount": "داشکاندن", "payment_method": "شێوازی پارەدان", "payment_amount": "پارەی دراو", "quantity": "بڕ", "price": "نرخ", "cost": "تێچوو", "role": "پلە", "permissions": "دەسەڵاتەکان", "email": "ئیمەیڵ", "is_active": "چالاک", "remaining_debt": "قەرزی ماوە", "total_paid": "کۆی دراو", "total_purchases": "کۆی کڕین", "shop_name": "ناوی دوکان", "address": "ناونیشان", "usd_rate": "نرخی دۆلار", "status": "دۆخ", "color": "ڕەنگ", "receipt_footer": "کۆتایی وەسڵ", "receipt_header": "سەری وەسڵ", "logo_url": "لۆگۆ", "auto_logout_time": "قوفڵی خۆکار", "auto_backup_time": "کاتی باکئەپ", "telegram_chat_id": "تێلیگرام Chat ID", "telegram_bot_token": "تێلیگرام Token", "debt_customer_id": "کڕیاری قەرز", "expected_yield": "بەرهەمی چاوەڕوانکراو", "type": "جۆر"}'::jsonb)->>k, k);
$$;

create or replace function public._audit_val(v jsonb) returns text
language plpgsql immutable as $$
declare t text;
begin
  if v is null or v = 'null'::jsonb then return '—'; end if;
  if jsonb_typeof(v) = 'number' then
    if (v::text)::numeric = trunc((v::text)::numeric) then
      return to_char((v::text)::numeric, 'FM999,999,999,999,990');
    end if;
    return to_char((v::text)::numeric, 'FM999,999,999,990.09');
  end if;
  if jsonb_typeof(v) = 'boolean' then return case when v::text = 'true' then 'بەڵێ' else 'نەخێر' end; end if;
  if jsonb_typeof(v) = 'string' then t := v #>> '{}'; else t := v::text; end if;
  if t = '' then return '—'; end if;
  if t in ('Cash') then return 'نەقد'; end if;
  if t in ('Debt') then return 'قەرز'; end if;
  if length(t) > 60 then t := left(t, 57) || '…'; end if;
  return t;
end $$;

create or replace function public._audit_money(v jsonb) returns text
language sql immutable as $$ select public._audit_val(v) || ' IQD' $$;

-- Columns never shown or compared
create or replace function public._audit_clean(j jsonb) returns jsonb
language sql immutable as $$
  select case when j is null then null else
    j - 'updated_at' - 'created_at' - 'password' - 'pin_code' - 'password_hash' - 'pin_hash' end;
$$;

-- ---------------------------------------------------------------------
-- Write one log row (never raises)
-- ---------------------------------------------------------------------
create or replace function public._audit_write(p_action text, p_details text, p_meta jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare a record;
begin
  select * into a from public._audit_actor();
  begin
    insert into public.activity_logs (user_id, user_name, action, details, metadata)
    values (a.actor_id, a.actor_name, p_action, p_details, p_meta);
  exception when others then
    begin
      insert into public.activity_logs (user_name, action, details, metadata)
      values (a.actor_name, p_action, p_details, p_meta);
    exception when others then null;
    end;
  end;
end $$;

-- ---------------------------------------------------------------------
-- Describe one changed row
-- ---------------------------------------------------------------------
create or replace function public._audit_one(p_table text, p_op text, p_old jsonb, p_new jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  o jsonb := public._audit_clean(p_old);
  n jsonb := public._audit_clean(p_new);
  r jsonb := coalesce(n, o);
  k text;
  changed text[] := '{}';
  diff jsonb := '{}'::jsonb;
  diff_txt text := '';
  v_action text;
  v_details text;
  v_name text := coalesce(r->>'name', r->>'shop_name', r->>'category', '');
  v_cust text;
begin
  if p_op = 'UPDATE' then
    for k in select jsonb_object_keys(coalesce(n, '{}'::jsonb)) loop
      if (o->k) is distinct from (n->k) then
        changed := changed || k;
        if k = 'telegram_bot_token' then
          diff := diff || jsonb_build_object(k, jsonb_build_object('old','••••','new','••••'));
        else
          diff := diff || jsonb_build_object(k, jsonb_build_object('old', o->k, 'new', n->k));
          diff_txt := diff_txt || case when diff_txt = '' then '' else ' | ' end ||
            public._audit_label(k) || ': ' || public._audit_val(o->k) || ' ← ' || public._audit_val(n->k);
        end if;
      end if;
    end loop;
    -- secrets only (password / PIN) changed
    if cardinality(changed) = 0 then
      if p_table = 'staff_users' and (p_old->>'password_hash' is distinct from p_new->>'password_hash'
                                   or p_old->>'pin_hash' is distinct from p_new->>'pin_hash') then
        perform public._audit_write('USER_PASSWORD_CHANGED', 'گۆڕینی پاسۆرد / PIN ی: ' || v_name,
                                    jsonb_build_object('table', p_table, 'id', r->>'id'));
      end if;
      return;
    end if;
  end if;

  case p_table
  when 'products' then
    if p_op = 'UPDATE' and changed <@ array['stock_level'] then
      v_action := 'STOCK_ADJUSTED';
      v_details := 'گۆڕینی مەوجوودی کاڵا: ' || v_name || ' (' || public._audit_val(o->'stock_level') || ' ← ' || public._audit_val(n->'stock_level') || ')';
    else
      v_action := case p_op when 'INSERT' then 'PRODUCT_ADDED' when 'UPDATE' then 'PRODUCT_UPDATED' else 'PRODUCT_DELETED' end;
      v_details := case p_op
        when 'INSERT' then 'زیادکردنی کاڵا: ' || v_name || ' — نرخ ' || public._audit_val(n->'selling_price') || '، مەوجوود ' || public._audit_val(n->'stock_level')
        when 'UPDATE' then 'دەستکاری کاڵا: ' || v_name || ' — ' || diff_txt
        else 'سڕینەوەی کاڵا: ' || v_name end;
    end if;

  when 'categories' then
    v_action := case p_op when 'INSERT' then 'CATEGORY_ADDED' when 'UPDATE' then 'CATEGORY_UPDATED' else 'CATEGORY_DELETED' end;
    v_details := case p_op when 'INSERT' then 'جۆری نوێ: ' || v_name
      when 'UPDATE' then 'دەستکاری جۆر: ' || v_name || ' — ' || diff_txt else 'سڕینەوەی جۆر: ' || v_name end;

  when 'customers' then
    if p_op = 'UPDATE' and changed <@ array['remaining_debt','total_paid','total_purchases'] then
      v_action := 'DEBT_BALANCE_CHANGED';
      v_details := 'گۆڕانی حسابی کڕیار: ' || v_name || ' — ' || diff_txt;
    else
      v_action := case p_op when 'INSERT' then 'CUSTOMER_ADDED' when 'UPDATE' then 'CUSTOMER_UPDATED' else 'CUSTOMER_DELETED' end;
      v_details := case p_op when 'INSERT' then 'کڕیاری نوێ: ' || v_name || coalesce(' — ' || nullif(n->>'phone',''), '')
        when 'UPDATE' then 'دەستکاری کڕیار: ' || v_name || ' — ' || diff_txt
        else 'سڕینەوەی کڕیار: ' || v_name || ' (قەرزی ماوە ' || public._audit_money(o->'remaining_debt') || ')' end;
    end if;

  when 'suppliers' then
    v_action := case p_op when 'INSERT' then 'SUPPLIER_ADDED' when 'UPDATE' then 'SUPPLIER_UPDATED' else 'SUPPLIER_DELETED' end;
    v_details := case p_op when 'INSERT' then 'کۆمپانیای نوێ: ' || v_name
      when 'UPDATE' then 'دەستکاری کۆمپانیا: ' || v_name || ' — ' || diff_txt else 'سڕینەوەی کۆمپانیا: ' || v_name end;

  when 'expenses' then
    v_action := case p_op when 'INSERT' then 'EXPENSE_ADDED' when 'UPDATE' then 'EXPENSE_UPDATED' else 'EXPENSE_DELETED' end;
    v_details := case p_op
      when 'INSERT' then 'تۆماری خەرجی: ' || coalesce(n->>'category','') || ' — ' || public._audit_money(n->'amount') || coalesce(' (' || nullif(n->>'notes','') || ')', '')
      when 'UPDATE' then 'دەستکاری خەرجی: ' || coalesce(n->>'category','') || ' — ' || diff_txt
      else 'سڕینەوەی خەرجی: ' || coalesce(o->>'category','') || ' — ' || public._audit_money(o->'amount') end;

  when 'debt_payments' then
    select c.name into v_cust from public.customers c where c.id::text = r->>'customer_id';
    v_action := case p_op when 'INSERT' then 'DEBT_PAYMENT' when 'UPDATE' then 'DEBT_PAYMENT_UPDATED' else 'DEBT_PAYMENT_DELETED' end;
    v_details := case p_op
      when 'INSERT' then 'وەرگرتنی قەرز: ' || public._audit_money(n->'amount') || ' لە ' || coalesce(v_cust, 'کڕیار')
      when 'UPDATE' then 'دەستکاری پارەدانی قەرز (' || coalesce(v_cust, '') || ') — ' || diff_txt
      else 'سڕینەوەی پارەدانی قەرز: ' || public._audit_money(o->'amount') || ' — ' || coalesce(v_cust, '') end;

  when 'sales' then
    select c.name into v_cust from public.customers c where c.id::text = r->>'debt_customer_id';
    v_action := case p_op when 'INSERT' then 'SALE_COMPLETED' when 'UPDATE' then 'SALE_UPDATED' else 'SALE_DELETED' end;
    v_details := case p_op
      when 'INSERT' then 'فرۆشتن: ' || public._audit_money(n->'total_amount') || ' — ' || public._audit_val(n->'payment_method')
                         || coalesce(' — ' || v_cust, '')
                         || case when coalesce((n->>'discount')::numeric, 0) > 0 then ' — داشکاندن ' || public._audit_val(n->'discount') else '' end
      when 'UPDATE' then 'دەستکاری وەسڵ #' || upper(left(r->>'id', 8)) || ' — ' || diff_txt
      else 'سڕینەوەی وەسڵ #' || upper(left(r->>'id', 8)) || ' — ' || public._audit_money(o->'total_amount') end;

  when 'sale_items' then
    if p_op = 'INSERT' then return; end if;   -- covered by the sale itself
    v_action := 'SALE_RETURNED';
    v_details := case p_op
      when 'UPDATE' then 'گەڕاندنەوەی بەشێک لە کاڵا: ' || v_name || ' — ' || diff_txt
      else 'لابردنی کاڵا لە وەسڵ: ' || v_name || ' × ' || public._audit_val(o->'quantity') end;

  when 'settings' then
    v_action := 'SETTINGS_UPDATED';
    v_details := 'گۆڕینی ڕێکخستنەکان' || case when diff_txt <> '' then ' — ' || diff_txt else '' end;

  when 'staff_users' then
    v_action := case p_op when 'INSERT' then 'USER_CREATED' when 'UPDATE' then 'USER_UPDATED' else 'USER_DELETED' end;
    v_details := case p_op when 'INSERT' then 'کارمەندی نوێ: ' || v_name || ' (' || coalesce(n->>'role','') || ')'
      when 'UPDATE' then 'دەستکاری کارمەند: ' || v_name || ' — ' || diff_txt else 'سڕینەوەی کارمەند: ' || v_name end;

  when 'physical_invoices' then
    v_action := case p_op when 'INSERT' then 'INVOICE_ADDED' when 'UPDATE' then 'INVOICE_UPDATED' else 'INVOICE_DELETED' end;
    v_details := case p_op when 'INSERT' then 'وەسڵی کاغەزی نوێ' || coalesce(' (' || nullif(r->>'type','') || ')', '')
      when 'UPDATE' then 'دەستکاری وەسڵی کاغەزی — ' || diff_txt else 'سڕینەوەی وەسڵی کاغەزی' end;

  when 'mix_recipes' then
    v_action := case p_op when 'INSERT' then 'MIX_ADDED' when 'UPDATE' then 'MIX_UPDATED' else 'MIX_DELETED' end;
    v_details := case p_op when 'INSERT' then 'ڕەچەتەی خەلتەی نوێ: ' || v_name
      when 'UPDATE' then 'دەستکاری ڕەچەتە: ' || v_name || ' — ' || diff_txt else 'سڕینەوەی ڕەچەتە: ' || v_name end;

  when 'mix_batches' then
    v_action := case p_op when 'INSERT' then 'MIX_PRODUCED' when 'UPDATE' then 'MIX_UPDATED' else 'MIX_DELETED' end;
    v_details := case p_op when 'INSERT' then 'دروستکردنی خەلتە' || coalesce(': ' || nullif(v_name,''), '')
      when 'UPDATE' then 'دەستکاری خەلتە — ' || diff_txt else 'سڕینەوەی خەلتە' end;

  else
    v_action := upper(p_table) || '_' || p_op;
    v_details := p_table || ': ' || case p_op when 'INSERT' then 'زیادکردن' when 'UPDATE' then 'دەستکاری — ' || diff_txt else 'سڕینەوە' end;
  end case;

  perform public._audit_write(v_action, v_details,
    jsonb_build_object('table', p_table, 'op', p_op, 'id', r->>'id')
    || case when p_op = 'UPDATE' then jsonb_build_object('changes', diff)
            when p_op = 'DELETE' then jsonb_build_object('deleted', o)
            else jsonb_build_object('row', n) end);
end $$;

-- ---------------------------------------------------------------------
-- Statement trigger: per-row logs, or one summary for big batches
-- ---------------------------------------------------------------------
create or replace function public._audit_stmt()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count int;
  rec record;
  v_table_ku text;
begin
  if coalesce(current_setting('app.audit_skip', true), '') = 'on' then return null; end if;

  begin
    if TG_OP = 'INSERT' then
      select count(*) into v_count from new_rows;
    elsif TG_OP = 'UPDATE' then
      select count(*) into v_count from new_rows;
    else
      select count(*) into v_count from old_rows;
    end if;

    if v_count = 0 then return null; end if;

    if v_count > 25 then
      v_table_ku := coalesce(jsonb_build_object(
        'products','کاڵا','customers','کڕیار','suppliers','کۆمپانیا','sales','وەسڵ','sale_items','کاڵای وەسڵ',
        'expenses','خەرجی','debt_payments','پارەدانی قەرز','categories','جۆر')->>TG_TABLE_NAME, TG_TABLE_NAME);
      perform public._audit_write(
        'BULK_' || TG_OP,
        case TG_OP when 'INSERT' then 'زیادکردنی ' when 'UPDATE' then 'دەستکاریکردنی ' else 'سڕینەوەی ' end
          || to_char(v_count, 'FM999,999,990') || ' ' || v_table_ku || ' بە یەکجار',
        jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'count', v_count));
      return null;
    end if;

    if TG_OP = 'INSERT' then
      for rec in select to_jsonb(n) as nj from new_rows n loop
        perform public._audit_one(TG_TABLE_NAME, TG_OP, null, rec.nj);
      end loop;
    elsif TG_OP = 'UPDATE' then
      for rec in select to_jsonb(o) as oj, to_jsonb(n) as nj
                 from old_rows o join new_rows n on to_jsonb(o)->>'id' = to_jsonb(n)->>'id' loop
        perform public._audit_one(TG_TABLE_NAME, TG_OP, rec.oj, rec.nj);
      end loop;
    else
      for rec in select to_jsonb(o) as oj from old_rows o loop
        perform public._audit_one(TG_TABLE_NAME, TG_OP, rec.oj, null);
      end loop;
    end if;
  exception when others then
    -- never block the real change because of the log
    raise warning 'audit failed on %: %', TG_TABLE_NAME, sqlerrm;
  end;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Attach to every table that exists
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['products','categories','customers','suppliers','expenses','debt_payments',
                           'sales','sale_items','settings','staff_users','physical_invoices',
                           'mix_recipes','mix_batches'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_ins on public.%I', t);
      execute format('drop trigger if exists audit_upd on public.%I', t);
      execute format('drop trigger if exists audit_del on public.%I', t);
      execute format('create trigger audit_ins after insert on public.%I referencing new table as new_rows for each statement execute function public._audit_stmt()', t);
      execute format('create trigger audit_upd after update on public.%I referencing old table as old_rows new table as new_rows for each statement execute function public._audit_stmt()', t);
      execute format('create trigger audit_del after delete on public.%I referencing old table as old_rows for each statement execute function public._audit_stmt()', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Sales: log the sale itself, not every stock/debt side-effect
-- ---------------------------------------------------------------------
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
  returning to_jsonb(sales.*) into v_sale;          -- ← logged as SALE_COMPLETED

  perform set_config('app.audit_skip', 'on', true);  -- items, stock & debt are part of this sale

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

  perform set_config('app.audit_skip', 'off', true);
  return v_sale;
end $$;

-- the app asks this once to know the database logs changes itself
create or replace function public.audit_enabled() returns boolean
language sql stable as $$ select true $$;

-- Logs are append-only for the app: it may add and read, never edit or delete
alter table public.activity_logs enable row level security;
drop policy if exists "logs_read" on public.activity_logs;
drop policy if exists "logs_insert" on public.activity_logs;
create policy "logs_read"   on public.activity_logs for select using (true);
create policy "logs_insert" on public.activity_logs for insert with check (true);
revoke update, delete on public.activity_logs from anon, authenticated;

revoke all on function public._audit_write(text, text, jsonb) from public, anon, authenticated;
revoke all on function public._audit_one(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.audit_enabled() to anon, authenticated;
grant execute on function public.process_sale(jsonb, jsonb, jsonb, text, numeric) to anon, authenticated;

notify pgrst, 'reload schema';
