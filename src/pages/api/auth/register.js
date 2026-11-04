import { json, withErrors } from "@/lib/store/http";
import { getSiteUrl } from "@/lib/store/mercadopago";
import { createUser, findUserByAuthId, findUserByEmail, findUserByUsername, setUserAuthId, toPublic } from "@/lib/store/services";
import { createSupabaseRouteClient } from "@/lib/store/supabase";
import { validateEmail } from "@/lib/store/mx-validate";

async function handler(req, res) {
  if (req.method !== "POST") return json(res, { error: "Método no permitido" }, 405);
  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!username || !password || !name || !email) {
    return json(res, { error: "Completa todos los campos" }, 400);
  }
  const emailError = validateEmail(email);
  if (emailError) return json(res, { error: emailError }, 400);
  if (password.length < 6) {
    return json(res, { error: "La contraseña debe tener al menos 6 caracteres" }, 400);
  }
  if (await findUserByUsername(username)) {
    return json(res, { error: "El usuario ya existe" }, 400);
  }
  if (await findUserByEmail(email)) {
    return json(res, { error: "Ese correo ya tiene cuenta" }, 400);
  }

  const supabase = createSupabaseRouteClient(req, res);
  const origin = getSiteUrl(req);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, name },
      emailRedirectTo: `${origin}/auth/callback?next=/cuenta`,
    },
  });
  if (error) {
    const message = /already registered|already exists|already been registered/i.test(error.message)
      ? "Ese correo ya tiene cuenta"
      : error.message;
    return json(res, { error: message }, 400);
  }
  if (!data?.user) return json(res, { error: "No se pudo crear la cuenta" }, 400);

  let profile = await findUserByAuthId(data.user.id);
  if (!profile) {
    profile = await createUser({
      id: data.user.id,
      authUserId: data.user.id,
      username,
      name,
      email,
      role: "customer",
    });
  } else if (!profile.authUserId) {
    profile = await setUserAuthId(profile.id, data.user.id);
  }

  if (!data.session) {
    return json(res, {
      user: null,
      needsConfirmation: true,
      message: "Te enviamos un correo para confirmar la cuenta. Ábrelo y luego entra.",
    }, 201);
  }
  return json(res, { user: toPublic(profile), token: "session" }, 201);
}

export default withErrors("auth/register", handler);
