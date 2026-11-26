-- ============================================================
-- PagoIA — Pagos de Stripe que no se reflejaban (2026-11-26)
-- La tabla transactions de producción venía de scripts/002_create_tables.sql:
-- receipt_number era VARCHAR(50) y el id de una sesión de Checkout (cs_test_…/cs_live_…)
-- mide ~66 caracteres, así que TODOS los inserts del webhook fallaban con
-- "value too long for type character varying(50)".
-- Idempotente: se puede ejecutar más de una vez.
-- ============================================================

-- 1. Columnas de transactions con el tamaño y los campos que usa el código.
alter table public.transactions alter column receipt_number type text;
alter table public.transactions alter column service_type type text;
alter table public.transactions alter column provider type text;
alter table public.transactions alter column status type text;

alter table public.transactions add column if not exists stripe_session_id text;
alter table public.transactions add column if not exists stripe_payment_intent text;
alter table public.transactions add column if not exists currency text not null default 'MXN';
alter table public.transactions add column if not exists metadata jsonb;

-- Idempotencia: una sesión de Checkout solo puede generar una transacción,
-- aunque Stripe reintente el webhook o el regreso del navegador también la registre.
create unique index if not exists transactions_stripe_session_id_key
  on public.transactions (stripe_session_id)
  where stripe_session_id is not null;

create index if not exists idx_transactions_user_date
  on public.transactions (user_id, transaction_date desc);

-- 2. Servicios: fecha del último pago, para que "Pagada" dure solo el periodo pagado
--    y el servicio vuelva a "Próxima" en el siguiente ciclo.
alter table public.user_services add column if not exists last_paid_at timestamptz;

-- 3. Pagos pendientes (recibos escaneados): referencia al pago que los liquidó.
alter table public.pending_payments add column if not exists paid_at timestamptz;
alter table public.pending_payments add column if not exists stripe_session_id text;

-- 4. Alertas: el código guarda la liga de cada aviso en alerts.url, pero la columna no existía,
--    así que TODA alerta (y su notificación push) fallaba con "column url does not exist".
alter table public.alerts add column if not exists url text;

-- Verificación: debe devolver las 4 columnas nuevas de transactions y receipt_number como text.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'transactions'
  and column_name in ('receipt_number', 'stripe_session_id', 'stripe_payment_intent', 'currency', 'metadata')
order by column_name;
