import { currentUserFromRequest, json, withErrors } from "@/lib/store/http";
import { toPublic, updateUser } from "@/lib/store/services";
import { createSupabaseRouteClient } from "@/lib/store/supabase";

async function handler(req, res) {
  if (req.method !== "PUT") return json(res, { error: "Método no permitido" }, 405);
  const user = await currentUserFromRequest(req, res);
  if (!user) return json(res, { error: "Inicia sesión" }, 401);
  const body = req.body || {};
  const patch = {};
  if (body.name) patch.name = String(body.name).trim();
  if (body.email) patch.email = String(body.email).trim().toLowerCase();
  if (body.phone !== undefined) patch.phone = String(body.phone).trim();
  if (body.shipping && typeof body.shipping === "object") patch.shipping = body.shipping;

  if (patch.email && patch.email !== user.email) {
    const supabase = createSupabaseRouteClient(req, res);
    const { error } = await supabase.auth.updateUser({ email: patch.email });
    if (error) return json(res, { error: error.message }, 400);
  }

  const updated = await updateUser(user.id, patch);
  return json(res, { user: toPublic(updated) });
}

export default withErrors("auth/profile", handler);
