import { json } from "@/lib/store/http";
import { mpFetch, readWebhookNotification, verifyMercadoPagoWebhook } from "@/lib/store/mercadopago";
import { applyMercadoPagoPayment } from "@/lib/store/payments";

/**
 * Webhook Mercado Pago, mismo contrato que NewWapifood:
 * topic=payment + id, firma x-signature, consulta GET /v1/payments/:id.
 * A diferencia de WapiFood, un error de base de datos responde 500 para que MP reintente.
 * Firma inválida: 401. Aviso que no es un pago: 200.
 */
export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    return json(res, { error: "Método no permitido" }, 405);
  }

  try {
    const note = readWebhookNotification(req);
    if (note.topic === "payment" && note.paymentId) {
      const signature = verifyMercadoPagoWebhook(req, note.signatureId);
      if (!signature.ok) {
        return json(res, { status: "unauthorized", reason: signature.reason }, 401);
      }
      const payment = await mpFetch(`/v1/payments/${note.paymentId}`);
      const result = await applyMercadoPagoPayment(payment);
      return json(res, { status: "success", ...result });
    }
    return json(res, { status: "ignored", topic: note.topic, paymentId: note.paymentId || null });
  } catch (error) {
    console.error("MP webhook error", error);
    return json(res, { status: "error", message: error.message || "Error" }, 500);
  }
}
