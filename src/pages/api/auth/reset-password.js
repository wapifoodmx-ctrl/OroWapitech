import { updatePassword } from "@/lib/store/auth-session";
import { json, withErrors } from "@/lib/store/http";

async function handler(req, res) {
  if (req.method !== "POST") return json(res, { error: "Método no permitido" }, 405);
  const newPassword = req.body?.newPassword || req.body?.password || "";
  await updatePassword(req, res, newPassword);
  return json(res, { ok: true, message: "Contraseña actualizada. Ya puedes entrar." });
}

export default withErrors("auth/reset-password", handler);
