# Estructura del proyecto — Oro Lozano

Documento de referencia del sistema (v14, pago con Mercado Pago).

## Stack

- **Next.js** (Pages Router) + **Tailwind CSS**
- **Supabase** (Postgres + Storage)
- **Auth propia** con JWT + cookie + **bcrypt**
- Recuperación de contraseña por **OTP** (Resend, o consola si no hay llave)
- **Mercado Pago Checkout Pro** (preferencia + webhook). Mismo estilo de llamada que NewWapifood: `fetch` a `https://api.mercadopago.com`, sin SDK en el navegador.

## Árbol principal

```
OroLozano/
├── scripts/seed-supabase.mjs
├── scripts/test-pago.mjs          # decisiones de pago, firma y preferencia (mock)
├── patches/orolozano-v14-pago.patch
├── supabase/
│   ├── schema.sql
│   ├── migration_v7.sql           # admin_data
│   ├── migration_v9.sql           # products.sold
│   ├── migration_v10.sql
│   └── migration_v14_pago.sql     # pago MP + reserva de pieza
├── src/
│   ├── components/
│   │   ├── AuthProvider.js        # sesión + fusión del carrito invitado
│   │   ├── CartDrawer.js
│   │   ├── PaymentReturn.js
│   │   └── …
│   ├── lib/store/
│   │   ├── mercadopago.js         # token, firma, preferencia (patrón WapiFood)
│   │   ├── payment-decision.js    # aprobado / pendiente / rechazado, sin red
│   │   ├── payments.js            # reserva, pedido, webhook
│   │   ├── services.js
│   │   └── …
│   └── pages/
│       ├── carrito/               # envío MX + redirect a MP
│       ├── pago/exito|pendiente|fallo
│       ├── cuenta/                # pedidos, pago, envío
│       ├── admin/                 # piezas, despacho, settings
│       └── api/
│           ├── orders.js
│           └── mercadopago/
│               ├── checkout.js    # reintentar preferencia
│               ├── webhook.js
│               └── sync.js        # la página de retorno adelanta el webhook
└── ESTRUCTURA_DEL_PROYECTO.md
```

## Tablas Supabase

| Tabla | Uso |
|--------|-----|
| `users` | Cuentas, perfil, shipping JSONB |
| `products` | Pieza única, certificado, `sold`, reserva (`reserved_order_id`) |
| `carts` | Carrito del cliente logueado |
| `orders` | Pedidos que no se borran, estatus, pago MP |
| `sessions` | Cookie de sesión |
| `password_resets` | OTP hasheado (15 min) |
| `admin_data` | Categorías, spot por kilataje, margen, IVA |
| Storage `products` | Fotos |

Columnas de pago en `orders`: `payment_status` (`pendiente`, `pagado`, `rechazado`, `cancelado`, `reembolsado`), `mp_preference_id`, `mp_payment_id`, `mp_status`, `mp_status_detail`, `paid_at`.

## Roles

- **customer**: arma carrito, paga, ve pedidos y corrige el envío mientras el pedido está recibido o confirmado.
- **admin** (`hugo`): Atelier. No compra. Despacha solo si el pago está `pagado` (los pedidos viejos, previos a esta pasarela, se migran como pagados).

## Precio

`spot(K) × peso × (1 + margen%) × (1 + IVA%)`.

Por defecto margen 35 e IVA 16, o sea `spot × peso × 1.35 × 1.16`. El resultado se guarda en centavos. Settings normaliza el kilataje (`18k` y `18K` son la misma llave) y muestra el spot del 1K al 24K para poder cotizar antes de publicar la pieza.

## Flujo de pago

1. El cliente (logueado) confirma el envío en `/carrito`.
2. `POST /api/orders` valida el envío, reserva cada pieza (`stock = 0`, `active = false`, `reserved_order_id`) y crea el pedido con `payment_status = pendiente`. El pedido no se borra.
3. Se crea una preferencia de Checkout Pro:
   - `external_reference` = id del pedido
   - `back_urls`: `/pago/exito`, `/pago/pendiente`, `/pago/fallo`
   - `notification_url`: `{origen}/api/mercadopago/webhook`
   - `auto_return`: `approved`
   - un solo pago (`installments: 1`)
   - el precio de cada pieza va en pesos (`centavos / 100`)
4. El navegador abre `init_point` o, si no viene, `sandbox_init_point` (igual que WapiFood).
5. Mercado Pago llama al webhook. La firma `x-signature` se verifica con `MERCADO_PAGO_WEBHOOK_SECRET` (manifiesto `id:{data.id};request-id:{x-request-id};ts:{ts};`). Después se consulta `GET /v1/payments/{id}`.
6. Resultado, idempotente:
   - **approved** → `payment_status = pagado`, estatus del pedido `confirmado`, pieza `sold = true`, `stock = 0`
   - **pending / in_process / in_mediation / authorized** → sigue pendiente y la pieza sigue reservada
   - **rejected** → pago rechazado, pedido `cancelado` (no se borra) y la pieza se libera
   - **cancelled** → pago cancelado y la pieza se libera
   - **refunded / charged_back** → `reembolsado`; si todavía no se envió, se cancela y se libera
7. Un segundo aviso del mismo pago no vuelve a vender ni a liberar. Un rechazo posterior no pisa un pago ya aprobado.
8. Dos clientes no pueden pagar la misma pieza: la reserva es un `UPDATE` condicional. Si el cliente abandona el checkout sin generar un pago, la reserva vence a las 2 horas. Un pago en efectivo pendiente no vence.

La página de retorno también llama `POST /api/mercadopago/sync` para aplicar el mismo criterio sin esperar al webhook. En localhost Mercado Pago no puede llamar al webhook; con credenciales de prueba, el sync de la página de retorno actualiza el pedido.

### Diferencias respecto a WapiFood

WapiFood cobra planes de restaurante. Esta tienda cobra pedidos.

- WapiFood guarda en `external_reference` un JSON (`restaurantId`, `planId`, `billing`). Aquí es el id del pedido, que es lo que el webhook tiene que encontrar. El resto de la preferencia (ítems, `payer`, `back_urls`, `auto_return`, `notification_url`, `installments: 1`) sigue el mismo cuerpo.
- WapiFood no lee `MERCADO_PAGO_PUBLIC_KEY`: el checkout es una redirección, no Checkout Bricks. Aquí tampoco se lee. Hay que configurarla igual para tener el set completo de variables.
- WapiFood responde 200 aunque el webhook falle. Aquí una falla de base o de red responde 500 para que Mercado Pago reintente. La firma inválida sigue en 401.
- Las URLs de retorno son `/pago/exito`, `/pago/pendiente` y `/pago/fallo`, no `/pagos/exito` y `/pagos?status=pending`.

## Variables de entorno

| Variable | Dónde se obtiene | Dónde se pone |
|----------|------------------|---------------|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Vercel y `.env.local` |
| `SUPABASE_SECRET_KEY` | Supabase → API → secret / service_role. Solo servidor | Vercel (Production y Preview), nunca `NEXT_PUBLIC_` |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase → API → publishable / anon | Vercel |
| `NEXT_PUBLIC_SUPABASE_URL` | La misma Project URL | Vercel |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | La misma llave publishable | Vercel |
| `OL_JWT_SECRET` | Una cadena larga generada por ti | Vercel |
| `RESEND_API_KEY` | resend.com → API Keys. Opcional | Vercel |
| `MAIL_FROM` | Un remitente verificado en Resend | Vercel |
| `MERCADO_PAGO_ACCESS_TOKEN` | [Mercado Pago Developers](https://www.mercadopago.com.mx/developers/panel/app) → tu aplicación → **Credenciales de prueba** o **Credenciales de producción** → Access Token. Pruebas: empieza con `TEST-` | Vercel → Settings → Environment Variables |
| `MERCADO_PAGO_PUBLIC_KEY` | La misma pantalla de credenciales → Public Key. La app no la usa en el navegador; se guarda para tener el par completo, como en WapiFood | Vercel |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Developers → tu aplicación → **Webhooks** → Configurar notificaciones. Al guardar la URL, MP muestra la **clave secreta** de la firma | Vercel. Sin esta clave el webhook responde 401 |
| `MERCADO_PAGO_COUNTRY` | No sale del panel. Para México el valor es `MX` (moneda MXN). WapiFood usa el mismo nombre | Vercel. Default `MX` si se omite |

En Vercel: Project → **Settings** → **Environment Variables**. Márcalas para Production y, si vas a probar el preview, también para Preview. Después hay que **volver a desplegar**: las variables no entran en un deployment ya construido.

No hace falta `NEXT_PUBLIC_SITE_URL`. El origen sale de la petición y, en Vercel, de `VERCEL_PROJECT_PRODUCTION_URL` o `VERCEL_URL`.

### Webhook que hay que registrar en Mercado Pago

```
https://TU-DOMINIO/api/mercadopago/webhook
```

Ejemplo, si el dominio de producción es `orolozano.vercel.app`:

```
https://orolozano.vercel.app/api/mercadopago/webhook
```

En el panel: Developers → tu aplicación → Webhooks → **Modo de prueba** o **Modo productivo**, según el token.

- URL de notificación: la de arriba
- Eventos: **Pagos** (`payment`)
- Guarda y copia la clave secreta a `MERCADO_PAGO_WEBHOOK_SECRET`

Mercado Pago tiene que poder hacer POST público a esa URL (HTTPS). `http://localhost:3000/api/mercadopago/webhook` no le sirve a MP; en local la página de retorno consulta el pago con `/api/mercadopago/sync` si hay `payment_id` en la URL.

## Probar con credenciales de prueba

1. Corre `migration_v14_pago.sql` en el SQL Editor.
2. En `.env.local` pon el Access Token de **prueba** y el secret del webhook de **prueba**. `MERCADO_PAGO_COUNTRY=MX`.
3. Crea un usuario de prueba en el panel (Cuentas de prueba). El comprador y el vendedor no pueden ser la misma cuenta.
4. `npm install`, `npm run seed:supabase`, `npm run dev`.
5. Entra como cliente, agrega una pieza, llena el envío y pulsa **Pagar con Mercado Pago**.
6. En el checkout de prueba usa las tarjetas de la documentación de MP. El titular **APRO** aprueba; **OTHE** queda pendiente; **FUND** o un rechazo libera la pieza al confirmarse el pago.
7. Al volver a `/pago/exito` la app consulta el pago. En local eso sustituye al webhook. Con el sitio ya en HTTPS, MP además llama al webhook.
8. En Mi cuenta el pedido debe decir **Pagado** y **Pedido confirmado**. En Atelier → Despachar ya se puede avanzar el envío. Cancelar un pedido no lo borra: libera la pieza solo si ese pedido la sigue teniendo.

`npm run test:pago` cubre la firma, la preferencia (mock) y los cambios de estado sin llaves reales. `MERCADO_PAGO_MOCK=1` arma una preferencia falsa y redirige a `/pago/exito` sin hablar con MP; no lo prendas en Vercel.

## Setup de base

1. SQL, en orden: `schema.sql`, `migration_v7.sql`, `migration_v9.sql`, `migration_v10.sql`, `migration_v14_pago.sql`
2. `.env.local` a partir de `.env.example`
3. `npm install` → `npm run seed:supabase` → `npm run dev`

## Seguridad

- La secret key de Supabase y el access token de MP solo viven en el servidor.
- Contraseñas con bcrypt. OTP hasheado.
- El webhook no aplica un pago si la firma no coincide.
- El envío sigue en JSONB plano (no cifrado).
