# Supabase — Oro Lozano

## 1. Schema (obligatorio, una vez)

1. Dashboard Supabase → **SQL Editor** → New query  
2. Pega **todo** `schema.sql`  
3. **Run**

## 2. Variables `.env.local` (raíz del proyecto)

Ver `.env.example`. Incluye opcionalmente:

```env
RESEND_API_KEY=re_xxx
MAIL_FROM=Oro Lozano <tu@dominio.com>
```

Sin `RESEND_API_KEY`, el OTP de recuperación se imprime en la **consola del servidor** (`npm run dev`).

## 3. Seed — ¿dónde se ejecuta?

En la **terminal de tu máquina**, dentro de la carpeta del proyecto (donde está `package.json`):

```powershell
cd C:\Users\Hugo\Desktop\orolozano
npm install
npm run seed:supabase
```

Eso corre `scripts/seed-supabase.mjs` y sube usuarios/productos a Supabase  
(contraseñas **hasheadas** con bcrypt: `hugo/1`, `juan/uwu`).

**No** se ejecuta dentro del SQL Editor.

## 4. Storage

Bucket `products` (imágenes). Subida desde el Atelier con `<input type="file">`.

## Migration v7 (después del schema base)

Si ya corriste `schema.sql`, ejecuta también en el SQL Editor:

`migration_v7.sql`

Crea tabla `admin_data` (categorías, spot por kilataje, margen, IVA).

## Migration v9 y v10

`migration_v9.sql` y `migration_v10.sql` agregan `products.sold`.

## Migration v14 — Mercado Pago

Después de las anteriores, ejecuta `migration_v14_pago.sql`.

Agrega en `orders`: `payment_status`, `mp_preference_id`, `mp_payment_id`, `mp_status`, `mp_status_detail`, `paid_at`.

Agrega en `products`: `reserved_order_id`, `reserved_at` (la pieza única se aparta al abrir el checkout).

Los pedidos que ya existían quedan como `payment_status = pagado` (o `cancelado` si el pedido estaba cancelado) para que el atelier pueda seguir despachándolos.
