import { changePassword } from "@/lib/store/auth-session";
import { currentUserFromRequest, json, withErrors } from "@/lib/store/http";

async function handler(req, res) {
  if (req.method !== "POST") return json(res, { error: "Método no permitido" }, 405);
  const user = await currentUserFromRequest(req, res);
  if (!user) return json(res, { error: "Inicia sesión" }, 401);
  await changePassword(req, res, user, req.body?.currentPassword || "", req.body?.newPassword || "");
  return json(res, { ok: true, message: "Contraseña actualizada" });
}

export default withErrors("auth/change-password", handler);
