import { currentUserFromRequest, json } from "@/lib/store/http";
import { sanitizeShipping, validateShippingMx } from "@/lib/store/mx-validate";
import { placeOrderAndPreference } from "@/lib/store/payments";
import { listOrders, updateOrderShipping } from "@/lib/store/services";

export default async function handler(req, res) {
  const user = await currentUserFromRequest(req);
  if (!user) return json(res, { error: "Inicia sesión" }, 401);

  if (req.method === "GET") {
    const orders = await listOrders(user.role === "admin" ? undefined : user.id);
    return json(res, { orders });
  }

  if (req.method === "POST") {
    if (user.role === "admin") {
      return json(res, { error: "Usa una cuenta de cliente" }, 403);
    }
    try {
      const body = req.body || {};
      const shipping = sanitizeShipping(body.shipping || {});
      const { order, preference } = await placeOrderAndPreference({ user, shipping, req });
      return json(res, {
        order,
        id: preference.id,
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point,
      }, 201);
    } catch (error) {
      console.error("checkout", error.detail || error);
      return json(res, { error: error.message || "No se pudo crear el pedido" }, error.status || 500);
    }
  }

  if (req.method === "PATCH") {
    if (user.role === "admin") {
      return json(res, { error: "Usa el panel de atelier" }, 403);
    }
    const orderId = req.body?.orderId || req.body?.id;
    const shipping = sanitizeShipping(req.body?.shipping || {});
    if (!orderId || !req.body?.shipping) {
      return json(res, { error: "orderId y shipping son requeridos" }, 400);
    }
    const orders = await listOrders(user.id);
    const mine = orders.find((order) => order.id === orderId);
    if (!mine) return json(res, { error: "Pedido no encontrado" }, 404);
    const merged = { ...(mine.shipping || {}), ...shipping };
    const shipError = validateShippingMx(merged);
    if (shipError) return json(res, { error: shipError }, 400);
    try {
      const order = await updateOrderShipping(orderId, merged, merged.fullName, merged.city);
      return json(res, { order });
    } catch (error) {
      return json(res, { error: error.message }, 400);
    }
  }

  return json(res, { error: "Método no permitido" }, 405);
}
