import { currentUserFromRequest, json, withErrors } from "@/lib/store/http";
import { getOrder } from "@/lib/store/services";
import { reopenOrderPreference } from "@/lib/store/payments";

/** Nueva preferencia para un pedido propio que sigue pendiente de pago. */
async function handler(req, res) {
  if (req.method !== "POST") return json(res, { error: "Método no permitido" }, 405);
  const user = await currentUserFromRequest(req, res);
  if (!user) return json(res, { error: "Inicia sesión" }, 401);
  if (user.role === "admin") return json(res, { error: "Usa una cuenta de cliente" }, 403);

  const orderId = req.body?.orderId;
  if (!orderId) return json(res, { error: "Pedido requerido" }, 400);
  const order = await getOrder(String(orderId));
  if (!order || order.userId !== user.id) return json(res, { error: "Pedido no encontrado" }, 404);

  try {
    const { order: saved, preference } = await reopenOrderPreference({ order, payer: user, req });
    return json(res, {
      order: saved,
      id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    });
  } catch (error) {
    console.error("MP checkout", error.detail || error);
    return json(res, { error: error.message || "Error Mercado Pago" }, error.status || 500);
  }
}

export default withErrors("api/mercadopago/checkout", handler);
