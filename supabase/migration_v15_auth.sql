-- Oro Lozano v15 — Supabase Auth
-- Ejecutar en el SQL Editor DESPUÉS de migration_v14_pago.sql.
-- No borra usuarios, pedidos ni carritos. El id de public.users se conserva.

alter table public.users add column if not exists auth_user_id uuid;
alter table public.users alter column password drop not null;

create unique index if not exists users_auth_user_id_uidx
  on public.users (auth_user_id)
  where auth_user_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'users_auth_user_id_fkey'
      and conrelid = 'public.users'::regclass
  ) then
    alter table public.users
      add constraint users_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users (id) on delete set null;
  end if;
end $$;

-- Al crear la cuenta en Auth, enlaza el perfil que ya existe (mismo correo)
-- o crea uno nuevo. Los pedidos siguen apuntando al id de siempre.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_id text;
  next_username text;
begin
  update public.users
  set auth_user_id = new.id
  where id = (
    select id
    from public.users
    where auth_user_id is null
      and lower(email) = lower(coalesce(new.email, ''))
    order by created_at
    limit 1
  )
  returning id into linked_id;

  if linked_id is not null then
    if new.raw_app_meta_data->>'role' = 'admin' then
      update public.users set role = 'admin' where id = linked_id;
    end if;
    return new;
  end if;

  next_username := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    split_part(coalesce(new.email, 'cliente'), '@', 1)
  );
  if exists (select 1 from public.users where lower(username) = lower(next_username)) then
    next_username := next_username || '-' || substr(new.id::text, 1, 4);
  end if;

  insert into public.users (id, auth_user_id, username, email, name, role, password, shipping)
  values (
    new.id::text,
    new.id,
    next_username,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'name', ''),
    case when new.raw_app_meta_data->>'role' = 'admin' then 'admin' else 'customer' end,
    null,
    jsonb_build_object('fullName', coalesce(new.raw_user_meta_data->>'name', ''))
  );
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Un cliente no puede cambiarse el rol ni desvincular su cuenta.
create or replace function public.protect_user_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    new.role := old.role;
    new.auth_user_id := old.auth_user_id;
    new.password := old.password;
    new.email := old.email;
    new.id := old.id;
    new.username := old.username;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_user_privileged_columns on public.users;
create trigger protect_user_privileged_columns
  before update on public.users
  for each row execute function public.protect_user_privileged_columns();

grant select on public.users to authenticated;
grant select on public.orders to authenticated;
grant select, insert, update, delete on public.carts to authenticated;

drop policy if exists "Usuario lee su perfil" on public.users;
create policy "Usuario lee su perfil"
  on public.users for select
  to authenticated
  using (auth_user_id = (select auth.uid()));

drop policy if exists "Usuario actualiza su perfil" on public.users;
create policy "Usuario actualiza su perfil"
  on public.users for update
  to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

drop policy if exists "Cliente lee sus pedidos" on public.orders;
create policy "Cliente lee sus pedidos"
  on public.orders for select
  to authenticated
  using (
    user_id in (
      select id from public.users where auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "Cliente lee su carrito" on public.carts;
create policy "Cliente lee su carrito"
  on public.carts for select
  to authenticated
  using (
    user_id in (
      select id from public.users where auth_user_id = (select auth.uid())
    )
  );

drop policy if exists "Cliente escribe su carrito" on public.carts;
create policy "Cliente escribe su carrito"
  on public.carts for all
  to authenticated
  using (
    user_id in (
      select id from public.users where auth_user_id = (select auth.uid())
    )
  )
  with check (
    user_id in (
      select id from public.users where auth_user_id = (select auth.uid())
    )
  );
