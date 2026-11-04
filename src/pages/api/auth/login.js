import { loginWithPassword } from "@/lib/store/auth-session";
import { json, withErrors } from "@/lib/store/http";
import { toPublic } from "@/lib/store/services";

async function handler(req, res) {
  if (req.method !== "POST") return json(res, { error: "Método no permitido" }, 405);
  const user = await loginWithPassword(req, res, req.body?.username, req.body?.password);
  return json(res, { user: toPublic(user), token: "session" });
}

export default withErrors("auth/login", handler);
