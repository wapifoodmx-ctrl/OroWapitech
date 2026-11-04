import { json, withErrors } from "@/lib/store/http";
import { createSupabaseRouteClient } from "@/lib/store/supabase";

async function handler(req, res) {
  if (req.method !== "POST") return json(res, { error: "Método no permitido" }, 405);
  const supabase = createSupabaseRouteClient(req, res);
  const { error } = await supabase.auth.signOut();
  if (error) return json(res, { error: error.message }, 400);
  return json(res, { ok: true });
}

export default withErrors("auth/logout", handler);
