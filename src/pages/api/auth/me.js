import { currentUserFromRequest, json, withErrors } from "@/lib/store/http";
import { toPublic } from "@/lib/store/services";

async function handler(req, res) {
  if (req.method !== "GET") return json(res, { error: "Método no permitido" }, 405);
  const user = await currentUserFromRequest(req, res);
  return json(res, { user: user ? toPublic(user) : null });
}

export default withErrors("auth/me", handler);
