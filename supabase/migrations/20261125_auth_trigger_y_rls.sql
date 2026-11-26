-- ============================================================
-- PagoIA — Endurecimiento del alta de usuarios y de RLS (2026-11-25)
-- Idempotente y tolerante: si una tabla o columna no existe, ese paso se salta.
-- Pegar completo en Supabase → SQL Editor → Run. Si aparece el aviso
-- "Potential issue detected", confirmar con "Run this query" (no borra datos).
-- ============================================================

-- 1. Trigger de alta: SECURITY DEFINER con search_path fijo.
--    Inserta solo las columnas que existan en public.profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url'
  ) then
    insert into public.profiles (id, full_name, avatar_url)
    values (
      new.id,
      nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), ''),
      nullif(new.raw_user_meta_data ->> 'avatar_url', '')
    )
    on conflict (id) do nothing;
  else
    insert into public.profiles (id, full_name)
    values (
      new.id,
      nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), '')
    )
    on conflict (id) do nothing;
  end if;
  return new;
exception
  when others then
    -- Nunca bloquear el registro por un fallo al crear el perfil.
    raise warning 'handle_new_user: no se pudo crear el perfil de %: %', new.id, sqlerrm;
    return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Perfiles faltantes de cuentas creadas antes de que el trigger funcionara.
insert into public.profiles (id, full_name)
select u.id, nullif(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- 2 y 3. Quitar políticas permisivas WITH CHECK (true) y el alta de pagos desde el navegador.
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('transactions',     'transactions_service_insert'),
      ('transactions',     'transactions_insert_own'),
      ('user_services',    'user_services_service_update'),
      ('alerts',           'alerts_service_insert'),
      ('predictions',      'predictions_service_insert'),
      ('refunds',          'refunds_service_insert'),
      ('pending_payments', 'pending_service_upsert')
    ) as t(table_name, policy_name)
  loop
    if to_regclass('public.' || item.table_name) is not null then
      execute format('drop policy if exists %I on public.%I', item.policy_name, item.table_name);
    end if;
  end loop;
end;
$$;

-- 4. Las actualizaciones propias no pueden reasignar la fila a otro usuario.
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('user_services',    'user_services_update_own', 'user_id'),
      ('pending_payments', 'pending_update_own',       'user_id'),
      ('alerts',           'alerts_update_own',        'user_id'),
      ('profiles',         'profiles_update_own',      'id')
    ) as t(table_name, policy_name, owner_column)
  loop
    if to_regclass('public.' || item.table_name) is not null
       and exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = item.table_name and column_name = item.owner_column
       )
    then
      execute format('drop policy if exists %I on public.%I', item.policy_name, item.table_name);
      execute format(
        'create policy %I on public.%I for update using (auth.uid() = %I) with check (auth.uid() = %I)',
        item.policy_name, item.table_name, item.owner_column, item.owner_column
      );
    end if;
  end loop;
end;
$$;

-- Verificación: debe devolver 0 filas (ninguna política INSERT/UPDATE con WITH CHECK (true)).
select tablename, policyname, cmd, with_check
from pg_policies
where schemaname = 'public' and with_check = 'true';
