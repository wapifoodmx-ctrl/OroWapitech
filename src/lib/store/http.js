import { findUserByAuthId, findUserByEmail, setUserAuthId } from "./services.js";
import { createSupabaseRouteClient } from "./supabase.js";
import { resolveRole } from "./roles.js";

export function json(res, data, status = 200) {
  res.status(status).json(data);
}

/** Envuelve una API para que un fallo quede en el log y en un JSON claro, no en "Internal Server Error". */
export function withErrors(route, handler) {
  return async function wrapped(req, res) {
    try {
      return await handler(req, res);
    } catch (error) {
      const status = Number(error?.status) || 500;
      const message = error?.message || "Error del servidor";
      console.error(`[orolozano] ${route} ${req?.method || ""} ${status}: ${message}`);
      if (error?.details) console.error(`[orolozano] ${route} detalle:`, error.details);
      if (res.headersSent) return;
      return json(res, { error: message }, status >= 400 && status < 600 ? status : 500);
    }
  };
}

export async function currentUserFromRequest(req, res) {
  const supabase = createSupabaseRouteClient(req, res);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;

  let profile = await findUserByAuthId(data.user.id);
  if (!profile && data.user.email) {
    const byEmail = await findUserByEmail(data.user.email);
    if (byEmail && !byEmail.authUserId) {
      profile = await setUserAuthId(byEmail.id, data.user.id);
    }
  }
  if (!profile) return null;
  profile.role = resolveRole(profile, data.user);
  return profile;
}
