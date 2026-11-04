/**
 * Ya no lo usa el sitio (v15): la recuperación la manda Supabase Auth.
 * Envío de correo para OTP de recuperación.
 * Prioridad:
 *  1. RESEND_API_KEY + MAIL_FROM  → Resend
 *  2. Sin key → log en consola del servidor (solo pruebas)
 */

export async function sendPasswordOtpEmail({ to, name, otp }) {
  const from = process.env.MAIL_FROM || "Oro Lozano <onboarding@resend.dev>";
  const subject = "Código de recuperación — Oro Lozano";
  const text = [
    `Hola ${name || ""},`.trim(),
    "",
    "Recibimos una solicitud para restablecer tu contraseña en Oro Lozano.",
    `Tu código OTP es: ${otp}`,
    "",
    "Vale por 15 minutos. Si no fuiste tú, ignora este mensaje.",
    "",
    "— Atelier Oro Lozano",
  ].join("\n");

  const html = `
    <div style="font-family:Georgia,serif;max-width:480px;margin:0 auto;color:#111">
      <h2 style="color:#c9a96e">Oro Lozano</h2>
      <p>Hola ${name || "cliente"},</p>
      <p>Tu código para restablecer la contraseña es:</p>
      <p style="font-size:28px;letter-spacing:8px;font-weight:bold">${otp}</p>
      <p style="color:#666;font-size:14px">Válido 15 minutos. Si no solicitaste esto, ignora el correo.</p>
    </div>
  `;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`No se pudo enviar el correo: ${body}`);
    }
    return { channel: "resend" };
  }

  // Modo pruebas: no falla, imprime OTP en la consola del servidor
  console.log("\n========== OTP RECUPERACIÓN (modo pruebas) ==========");
  console.log(`Para: ${to}`);
  console.log(`OTP:  ${otp}`);
  console.log("=====================================================\n");
  return { channel: "console" };
}
