-- Aryaland v0.1: apply once with the Supabase SQL editor or `supabase db push`.
begin;
create table public.households (
 id uuid primary key default gen_random_uuid(), name text not null default 'Aryaland',
 created_at timestamptz not null default now()
);
create table public.household_members (
 household_id uuid not null references public.households(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 display_name text not null check(display_name in ('Serkan','Rabia')),
 can_manage_budget boolean not null default false,
 primary key(household_id,user_id), unique(user_id)
);
create table public.items (
 id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
 kind text not null check(kind in ('task','need','note','event','trip')),
 payload jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint valid_item_payload check (
   jsonb_typeof(payload)='object' and length(payload::text)<=12000
   and payload->>'id'=id::text and payload->>'kind'=kind
   and jsonb_typeof(payload->'title')='string' and length(trim(payload->>'title')) between 1 and 120
   and jsonb_typeof(payload->'details')='string' and length(payload->>'details')<=3000
   and jsonb_typeof(payload->'done')='boolean' and jsonb_typeof(payload->'pinned')='boolean'
   and payload->>'assignee' in ('Serkan','Rabia','Birlikte')
   and jsonb_typeof(payload->'date')='string' and jsonb_typeof(payload->'endDate')='string'
   and jsonb_typeof(payload->'category')='string' and length(payload->>'category')<=50
   and jsonb_typeof(payload->'place')='string' and length(payload->>'place')<=250
   and jsonb_typeof(payload->'createdAt')='string'
   and payload ?& array['id','kind','title','details','done','pinned','assignee','date','endDate','category','place','createdAt']
 )
);
create index items_household_idx on public.items(household_id,created_at desc);
create function public.touch_item_updated_at() returns trigger language plpgsql set search_path='' as $$
begin
 new.updated_at=clock_timestamp();
 new.created_at=old.created_at;
 new.household_id=old.household_id;
 return new;
end $$;
create trigger items_touch before update on public.items for each row execute function public.touch_item_updated_at();
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.items enable row level security;
revoke all on public.households,public.household_members,public.items from anon,authenticated;
grant select on public.households,public.household_members to authenticated;
grant select,insert,update,delete on public.items to authenticated;
create policy own_membership on public.household_members for select to authenticated using(user_id=(select auth.uid()));
create policy read_own_house on public.households for select to authenticated using(exists(select 1 from public.household_members m where m.household_id=households.id and m.user_id=(select auth.uid())));
create policy read_items on public.items for select to authenticated using(exists(select 1 from public.household_members m where m.household_id=items.household_id and m.user_id=(select auth.uid())));
create policy insert_items on public.items for insert to authenticated with check(exists(select 1 from public.household_members m where m.household_id=items.household_id and m.user_id=(select auth.uid())));
create policy update_items on public.items for update to authenticated using(exists(select 1 from public.household_members m where m.household_id=items.household_id and m.user_id=(select auth.uid()))) with check(exists(select 1 from public.household_members m where m.household_id=items.household_id and m.user_id=(select auth.uid())));
create policy delete_items on public.items for delete to authenticated using(exists(select 1 from public.household_members m where m.household_id=items.household_id and m.user_id=(select auth.uid())));

-- Budget data has NO browser role grants and NO client-facing RLS policies.
-- Only the server function may access it, after both login and a short-lived password grant.
create table public.budget_transactions (
 id uuid primary key, household_id uuid not null references public.households(id) on delete cascade,
 type text not null check(type in ('income','expense')),
 amount_cents bigint not null check(amount_cents>0 and amount_cents<=1000000000000),
 category text not null check(category in ('Market','Ev','Ulaşım','Gezi','Arya','Fatura','Sağlık','Diğer')),
 description text not null check(length(trim(description)) between 1 and 160),
 date date not null,
 paid_by text not null check(paid_by in ('Serkan','Rabia','Birlikte')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index budget_household_date_idx on public.budget_transactions(household_id,date desc);
create table public.budget_grants (
 token_hash text primary key, household_id uuid not null references public.households(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index budget_grants_user_idx on public.budget_grants(user_id);
create table public.budget_unlock_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null default now(), attempts int not null default 0
);
alter table public.budget_transactions enable row level security;
alter table public.budget_grants enable row level security;
alter table public.budget_unlock_limits enable row level security;
revoke all on public.budget_transactions,public.budget_grants,public.budget_unlock_limits from anon,authenticated;
grant all on public.households,public.household_members,public.items,public.budget_transactions,public.budget_grants,public.budget_unlock_limits to service_role;
create function public.consume_budget_unlock_attempt(p_user uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare n int;
begin
 insert into public.budget_unlock_limits(user_id,window_start,attempts) values(p_user,clock_timestamp(),1)
 on conflict(user_id) do update set
 attempts=case when budget_unlock_limits.window_start<clock_timestamp()-interval '15 minutes' then 1 else least(budget_unlock_limits.attempts+1,6) end,
 window_start=case when budget_unlock_limits.window_start<clock_timestamp()-interval '15 minutes' then clock_timestamp() else budget_unlock_limits.window_start end
 returning attempts into n;
 return n<=5;
end $$;
revoke all on function public.consume_budget_unlock_attempt(uuid) from public,anon,authenticated;
grant execute on function public.consume_budget_unlock_attempt(uuid) to service_role;
commit;
