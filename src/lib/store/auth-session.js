import { verifyPassword } from "./password.js";
import { getSiteUrl } from "./mercadopago.js";
import { resolveRole } from "./roles.js";
import {
  findUserByAuthId,
  findUserByEmail,
  findUserByUsername,
  setUserAuthId,
} from "./services.js";
import { getAdminClient, createSupabaseRouteClient } from "./supabase.js";

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

async function findAuthIdByEmail(email) {
  const admin = getAdminClient();
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = (data?.users || []).find((user) => user.email?.toLowerCase() === target);
    if (found) return found.id;
    if (!data?.users || data.users.length < 200) break;
  }
  return null;
}

/** Crea el usuario en Supabase Auth conservando el hash bcrypt y lo enlaza al perfil. */
export async function ensureAuthUser(profile) {
  if (!profile) return null;
  if (profile.authUserId) return profile.authUserId;
  if (!profile.email) {
    throw httpError("Esta cuenta no tiene correo. Pide al atelier que lo registre.", 400);
  }

  const admin = getAdminClient();
  const payload = {
    email: profile.email,
    email_confirm: true,
    user_metadata: { username: profile.username, name: profile.name || "" },
    app_metadata: { role: profile.role === "admin" ? "admin" : "customer" },
  };
  if (String(profile.password || "").startsWith("$2")) {
    payload.password_hash = profile.password;
  }

  let authId = null;
  const created = await admin.auth.admin.createUser(payload);
  if (created.error) {
    const message = created.error.message || "";
    if (!/already|registered|exists|duplicate/i.test(message)) {
      throw new Error(message);
    }
    authId = await findAuthIdByEmail(profile.email);
  } else {
    authId = created.data?.user?.id || null;
  }
  if (!authId) throw new Error("No se pudo enlazar la cuenta con Supabase Auth");
  await setUserAuthId(profile.id, authId);
  return authId;
}

export async function loginWithPassword(req, res, username, password) {
  const raw = String(username || "").trim();
  const secret = String(password || "");
  if (!raw || !secret) throw httpError("Usuario o contraseña incorrectos", 401);

  let profile = looksLikeEmail(raw) ? await findUserByEmail(raw) : await findUserByUsername(raw);
  if (!profile && looksLikeEmail(raw)) profile = await findUserByUsername(raw);
  const email = profile?.email || (looksLikeEmail(raw) ? raw.toLowerCase() : "");
  if (!email) throw httpError("Usuario o contraseña incorrectos", 401);

  const supabase = createSupabaseRouteClient(req, res);
  let signed = await supabase.auth.signInWithPassword({ email, password: secret });

  const passwordMatches =
    profile && (await verifyPassword(secret, profile.password || ""));
  if (signed.error && profile && passwordMatches) {
    await ensureAuthUser(profile);
    signed = await supabase.auth.signInWithPassword({ email, password: secret });
  }
  if (signed.error || !signed.data?.user) {
    const detail = signed.error?.message || "";
    if (passwordMatches && /at least|too short|password/i.test(detail)) {
      throw httpError(
        "La contraseña es correcta, pero Supabase la considera corta. En Authentication baja el mínimo de caracteres o restablécela con el correo.",
        400,
      );
    }
    throw httpError("Usuario o contraseña incorrectos", 401);
  }

  if (profile && !profile.authUserId) {
    profile = await setUserAuthId(profile.id, signed.data.user.id);
  }
  let user = await findUserByAuthId(signed.data.user.id);
  if (!user && profile) user = profile;
  if (!user) {
    user = await findUserByEmail(signed.data.user.email || email);
  }
  if (!user) throw httpError("No encontramos el perfil de esta cuenta.", 403);
  user.role = resolveRole(user, signed.data.user);
  return user;
}

export async function sendPasswordReset(req, res, email) {
  const supabase = createSupabaseRouteClient(req, res);
  const origin = getSiteUrl(req);
  const { error } = await supabase.auth.resetPasswordForEmail(String(email || "").trim().toLowerCase(), {
    redirectTo: `${origin}/auth/callback?next=/cuenta/restablecer`,
  });
  if (error) throw new Error(error.message);
}

export async function updatePassword(req, res, newPassword) {
  if (String(newPassword || "").length < 6) {
    throw httpError("La contraseña debe tener al menos 6 caracteres", 400);
  }
  const supabase = createSupabaseRouteClient(req, res);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) throw httpError("El enlace venció. Pide otro correo de recuperación.", 401);
  const { error } = await supabase.auth.updateUser({ password: String(newPassword) });
  if (error) throw new Error(error.message);
}

export async function changePassword(req, res, user, currentPassword, newPassword) {
  if (String(newPassword || "").length < 6) {
    throw httpError("La nueva contraseña debe tener al menos 6 caracteres", 400);
  }
  if (String(newPassword).length > 64) throw httpError("Máximo 64 caracteres", 400);
  const supabase = createSupabaseRouteClient(req, res);
  const signed = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signed.error) throw httpError("Contraseña actual incorrecta", 401);
  const { error } = await supabase.auth.updateUser({ password: String(newPassword) });
  if (error) throw new Error(error.message);
}
