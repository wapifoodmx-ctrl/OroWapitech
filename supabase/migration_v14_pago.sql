-- Oro Lozano v14 — Mercado Pago (Checkout Pro)
-- Ejecutar en el SQL Editor DESPUÉS de schema.sql y de migration_v7/v9/v10.
-- Idempotente: se puede correr más de una vez.

alter table public.orders add column if not exists payment_status text;
alter table public.orders add column if not exists mp_preference_id text;
alter table public.orders add column if not exists mp_payment_id text;
alter table public.orders add column if not exists mp_status text;
alter table public.orders add column if not exists mp_status_detail text;
alter table public.orders add column if not exists paid_at timestamptz;

-- Pedidos de antes de la pasarela: el atelier ya los cobró fuera de MP.
-- Solo se rellenan filas con payment_status nulo (no toca pagos nuevos).
update public.orders
set payment_status = 'cancelado'
where payment_status is null
  and status = 'cancelado';

update public.orders
set payment_status = 'pagado'
where payment_status is null
  and status is distinct from 'cancelado';

alter table public.orders alter column payment_status set default 'pendiente';
alter table public.orders alter column payment_status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_payment_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_payment_status_check
      check (payment_status in ('pendiente', 'pagado', 'rechazado', 'cancelado', 'reembolsado'));
  end if;
end $$;

create index if not exists orders_payment_status_idx on public.orders (payment_status);
create index if not exists orders_mp_preference_id_idx on public.orders (mp_preference_id);

-- Un pago de MP no puede aplicarse a dos pedidos. Los nulos (aún sin pago) quedan fuera.
create unique index if not exists orders_mp_payment_id_uidx
  on public.orders (mp_payment_id)
  where mp_payment_id is not null;

-- Reserva de pieza única mientras el cliente está en el checkout.
-- Sin llave foránea: la reserva se escribe ANTES de insertar el pedido.
alter table public.products add column if not exists reserved_order_id text;
alter table public.products add column if not exists reserved_at timestamptz;

create index if not exists products_reserved_order_idx
  on public.products (reserved_order_id)
  where reserved_order_id is not null;
