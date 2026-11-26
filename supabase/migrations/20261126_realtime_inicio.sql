-- ============================================================
-- PagoIA — Tiempo real para el inicio del panel (2026-11-26)
-- Agrega transactions, pending_payments y receipts a la publicación supabase_realtime
-- para que el resumen y la actividad reciente se actualicen sin recargar.
-- Realtime respeta RLS: cada usuario solo recibe cambios de sus propias filas.
-- Idempotente: si una tabla ya está publicada o no existe, se salta.
-- ============================================================
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array['transactions', 'pending_payments', 'receipts'] loop
    if to_regclass('public.' || t) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
       )
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- Verificación: debe listar las tres tablas.
select tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in ('transactions', 'pending_payments', 'receipts')
order by tablename;
