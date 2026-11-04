/**
 * Pasa los usuarios de public.users a Supabase Auth sin cambiar su id
 * ni los pedidos. Conserva el hash bcrypt.
 *
 * Antes: corre supabase/migration_v15_auth.sql en el SQL Editor.
 *
 *   npm run auth:migrate
 */
import { createClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "../src/lib/store/env.js";

const url = supabaseUrl();
const key = supabaseSecretKey();
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY).");
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findAuthId(email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = (data?.users || []).find((user) => user.email?.toLowerCase() === email);
    if (found) return found.id;
    if (!data?.users || data.users.length < 200) return null;
  }
  return null;
}

const { data: users, error } = await sb.from("users").select("*");
if (error) {
  console.error(error.message);
  if (/auth_user_id/.test(error.message)) {
    console.error("Primero corre supabase/migration_v15_auth.sql");
  }
  process.exit(1);
}

let linked = 0;
let skipped = 0;
for (const user of users || []) {
  if (user.auth_user_id) {
    console.log(`= ${user.username} ya enlazado`);
    skipped += 1;
    continue;
  }
  if (!user.email) {
    console.warn(`! ${user.username} no tiene correo. Agrégalo en la tabla users y vuelve a correr este script.`);
    continue;
  }
  const email = String(user.email).trim().toLowerCase();
  const payload = {
    email,
    email_confirm: true,
    user_metadata: { username: user.username, name: user.name || "" },
    app_metadata: { role: user.role === "admin" ? "admin" : "customer" },
  };
  if (String(user.password || "").startsWith("$2")) {
    payload.password_hash = user.password;
  } else {
    console.warn(`! ${user.username} no tiene hash bcrypt. Entra con "Olvidé mi contraseña".`);
    continue;
  }

  let authId = null;
  const created = await sb.auth.admin.createUser(payload);
  if (created.error) {
    if (!/already|registered|exists|duplicate/i.test(created.error.message || "")) {
      console.error(`x ${user.username}: ${created.error.message}`);
      continue;
    }
    authId = await findAuthId(email);
  } else {
    authId = created.data?.user?.id || null;
  }

  const { data: fresh } = await sb.from("users").select("auth_user_id").eq("id", user.id).maybeSingle();
  if (fresh?.auth_user_id) {
    console.log(`+ ${user.username} enlazado por el trigger`);
    linked += 1;
    continue;
  }
  if (!authId) {
    console.error(`x ${user.username}: no se obtuvo el id de Auth`);
    continue;
  }
  const { error: updateError } = await sb.from("users").update({ auth_user_id: authId }).eq("id", user.id);
  if (updateError) {
    console.error(`x ${user.username}: ${updateError.message}`);
    continue;
  }
  console.log(`+ ${user.username} enlazado`);
  linked += 1;
}

console.log(`Listo. Enlazados: ${linked}. Ya estaban: ${skipped}.`);
