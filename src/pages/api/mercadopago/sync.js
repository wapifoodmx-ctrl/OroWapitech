import { currentUserFromRequest, json, withErrors } from "@/lib/store/http";
import { mpFetch } from "@/lib/store/mercadopago";
import { applyMercadoPagoPayment } from "@/lib/store/payments";
import { readOrderIdFromPayment } from "@/lib/store/payment-decision";
import { getOrder } from "@/lib/store/services";

/**
 * La página de retorno consulta el pago en Mercado Pago.
 * El webhook sigue siendo la fuente de verdad; esto solo adelanta el mismo efecto.
 */
async function handler(req, res) {
  if (req.method !== "POST") return json(res, { error: "Método no permitido" }, 405);
  const user = await currentUserFromRequest(req, res);
  if (!user) return json(res, { error: "Inicia sesión" }, 401);

  const paymentId = req.body?.paymentId || req.body?.collectionId;
  if (!paymentId) return json(res, { error: "Falta el id del pago" }, 400);

  try {
    const payment = await mpFetch(`/v1/payments/${paymentId}`);
    const orderId = readOrderIdFromPayment(payment);
    const existing = orderId ? await getOrder(orderId) : null;
    if (!existing || (user.role !== "admin" && existing.userId !== user.id)) {
      return json(res, { error: "Pedido no encontrado" }, 404);
    }
    const result = await applyMercadoPagoPayment(payment);
    const order = await getOrder(orderId);
    return json(res, { order, result, mpStatus: payment.status || null });
  } catch (error) {
    console.error("MP sync", error.detail || error);
    return json(res, { error: error.message || "No se pudo consultar el pago" }, error.status || 500);
  }
}

export default withErrors("api/mercadopago/sync", handler);
