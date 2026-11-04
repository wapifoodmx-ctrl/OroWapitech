# Estructura del proyecto — Oro Lozano

Documento de referencia del sistema (v15, Supabase Auth + Mercado Pago).

## Stack

- **Next.js** (Pages Router) + **Tailwind CSS**
- **Supabase** (Postgres + Storage + **Auth**)
- Sesión con **@supabase/ssr** y cookies. El servidor valida con `getUser()`.
- Recuperación de contraseña con el correo de Supabase (enlace), no con Resend.
- **Mercado Pago Checkout Pro** (preferencia + webhook). Mismo estilo de llamada que NewWapifood: `fetch` a `https://api.mercadopago.com`, sin SDK en el navegador.

## Árbol principal

```
OroLozano/
├── scripts/seed-supabase.mjs
├── scripts/migrate-auth-users.mjs # pasa usuarios actuales a Supabase Auth
├── scripts/test-pago.mjs
├── scripts/test-auth.mjs
├── patches/orolozano-v14-pago.patch
├── patches/orolozano-v15-auth.patch
├── supabase/
│   ├── schema.sql
│   ├── migration_v7.sql
│   ├── migration_v9.sql
│   ├── migration_v10.sql
│   ├── migration_v14_pago.sql
│   └── migration_v15_auth.sql     # enlace con auth.users + RLS
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
│       ├── cuenta/                # entrar, pedidos, pago, envío
│       ├── cuenta/restablecer.js  # nueva contraseña desde el correo
│       ├── auth/callback.js       # confirma el enlace de Supabase
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
| `users` | Perfil, envío y `auth_user_id` (el id de Auth). El id propio no cambia |
| `products` | Pieza única, certificado, `sold`, reserva (`reserved_order_id`) |
| `carts` | Carrito del cliente logueado |
| `orders` | Pedidos que no se borran, estatus, pago MP |
| `sessions` | Ya no se usa para entrar (queda de la auth anterior) |
| `password_resets` | Ya no se usa (el correo lo manda Supabase) |
| `admin_data` | Categorías, spot por kilataje, margen, IVA |
| Storage `products` | Fotos |

Columnas de pago en `orders`: `payment_status` (`pendiente`, `pagado`, `rechazado`, `cancelado`, `reembolsado`), `mp_preference_id`, `mp_payment_id`, `mp_status`, `mp_status_detail`, `paid_at`.

## Cómo se entra

1. Registro y login usan Supabase Auth. Se puede entrar con el usuario de siempre (`hugo`, `juan`) o con el correo. La sesión queda en cookies; las API la leen en el servidor.
2. Al entrar, el carrito armado sin cuenta se pasa al carrito del cliente.
3. "Olvidé mi contraseña" manda un enlace al correo. El enlace vuelve a `/auth/callback` y de ahí a `/cuenta/restablecer`.
4. Un usuario que ya existía conserva su id, sus pedidos y su hash bcrypt. El script `npm run auth:migrate` lo crea en Auth. Si todavía no se corrió el script, el primer login con la contraseña de siempre también lo enlaza.
5. Hugo sigue siendo admin por `users.role` y por `app_metadata.role`. El Atelier lo comprueba el servidor. El rol no se puede cambiar desde el navegador.

## Roles

- **customer**: arma carrito, paga, ve pedidos y corrige el envío mientras el pedido está recibido o confirmado.
- **admin** (`hugo`): Atelier. No compra. Despacha solo si el pago está `pagado` (los pedidos viejos, previos a la pasarela, se migran como pagados).

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
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Vercel. Es la que ya está |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase → API → publishable / anon | Vercel. Es la que ya está |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → service_role. Solo servidor | Vercel. Es la que ya está. Nunca con `NEXT_PUBLIC_` |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY` | Alias opcionales de las tres de arriba | No hace falta duplicarlas |
| `OL_JWT_SECRET`, `RESEND_API_KEY`, `MAIL_FROM` | Ya no se usan | Se pueden borrar de Vercel |
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

Ejemplo de producción:

```
https://oro-wapitech.vercel.app/api/mercadopago/webhook
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

## Auth en el panel de Supabase

1. Corre `migration_v15_auth.sql` y después, en tu máquina, `npm run auth:migrate` con la service role en `.env.local`.
2. **Authentication → URL Configuration**
   - Site URL: `https://oro-wapitech.vercel.app`
   - Redirect URLs: `https://oro-wapitech.vercel.app/**` y `http://localhost:3000/**`
3. **Authentication → Emails**: deja la plantilla de "Reset password" y "Confirm signup". El enlace debe usar `{{ .ConfirmationURL }}` (la plantilla por defecto ya lo hace).
4. El correo incluido de Supabase tiene un límite bajo (unos pocos por hora). Para la tienda real conviene **Authentication → SMTP** con un correo propio (Resend, el del dominio, etc.). Si no, los clientes pueden quedarse sin correo de recuperación cuando haya varios pedidos de enlace.
5. Si alguna contraseña vieja tiene menos de 6 caracteres (la de demostración `1`), en **Authentication → Providers → Email** baja "Minimum password length" o restablécela con el enlace.

## Setup de base

1. SQL, en orden: `schema.sql`, `migration_v7.sql`, `migration_v9.sql`, `migration_v10.sql`, `migration_v14_pago.sql`, `migration_v15_auth.sql`
2. `.env.local` a partir de `.env.example`
3. `npm install` → `npm run seed:supabase` → `npm run auth:migrate` → `npm run dev`

## Seguridad

- La service role y el access token de MP solo viven en el servidor. Se leen al atender la petición, no se congelan vacías en el build.
- La sesión la firma Supabase. El rol admin no se toma de datos que el usuario pueda editar.
- El webhook no aplica un pago si la firma no coincide.
- El envío sigue en JSONB plano (no cifrado).
