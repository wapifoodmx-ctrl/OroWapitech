import { sendPasswordReset } from "@/lib/store/auth-session";
import { json, withErrors } from "@/lib/store/http";
import { validateEmail } from "@/lib/store/mx-validate";

async function handler(req, res) {
  if (req.method !== "POST") return json(res, { error: "Método no permitido" }, 405);
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) return json(res, { error: "Indica tu correo" }, 400);
  const emailError = validateEmail(email);
  if (emailError) return json(res, { error: emailError }, 400);
  await sendPasswordReset(req, res, email);
  return json(res, {
    ok: true,
    message: "Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.",
  });
}

export default withErrors("auth/forgot-password", handler);
