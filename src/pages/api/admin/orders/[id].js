import { currentUserFromRequest, json, withErrors } from "@/lib/store/http";
import {
  updateOrderStatus,
  releaseProductIfHeldBy,
  updateOrderShipping,
  getOrder,
} from "@/lib/store/services";
import { ORDER_STATUSES, canAdvanceFulfillment } from "@/lib/store/order-status";

const ALLOWED = new Set(ORDER_STATUSES.map((s) => s.id));

async function handler(req, res) {
  const user = await currentUserFromRequest(req, res);
  if (!user || user.role !== "admin") return json(res, { error: "No autorizado" }, 403);
  const { id } = req.query;

  if (req.method === "PATCH" || req.method === "PUT") {
    const body = req.body || {};

    // Liberar productos de un pedido cancelado
    if (body.action === "release_products") {
      const order = await getOrder(id);
      if (!order) return json(res, { error: "Pedido no encontrado" }, 404);
      if (order.status !== "cancelado") {
        return json(res, { error: "Solo se liberan piezas de pedidos cancelados" }, 400);
      }
      if (order.paymentStatus === "pagado") {
        return json(res, { error: "El pago sigue aprobado. Reembolsa en Mercado Pago antes de liberar." }, 400);
      }
      for (const item of order.items || []) {
        if (item.productId) await releaseProductIfHeldBy(item.productId, order.id);
      }
      return json(res, { ok: true, message: "Piezas liberadas al catálogo" });
    }

    // Actualizar envío
    if (body.shipping) {
      try {
        const order = await updateOrderShipping(
          id,
          body.shipping,
          body.shippingName || body.shipping.fullName,
          body.shippingCity || body.shipping.city,
        );
        if (!order) return json(res, { error: "Pedido no encontrado" }, 404);
        return json(res, { order });
      } catch (e) {
        return json(res, { error: e.message }, 400);
      }
    }

    const status = body.status;
    const note = body.note || "";
    if (!status || !ALLOWED.has(status)) {
      return json(res, { error: "Estatus inválido" }, 400);
    }
    const current = await getOrder(id);
    if (!current) return json(res, { error: "Pedido no encontrado" }, 404);
    if (status !== current.status && status !== "cancelado" && !canAdvanceFulfillment(current)) {
      return json(res, { error: "El pedido todavía no tiene un pago aprobado" }, 400);
    }
    try {
      const order = await updateOrderStatus(id, status, note);
      if (!order) return json(res, { error: "Pedido no encontrado" }, 404);
      return json(res, { order });
    } catch (e) {
      return json(res, { error: e.message }, 400);
    }
  }

  if (req.method === "DELETE") {
    return json(res, { error: "Los pedidos no se pueden eliminar" }, 405);
  }

  return json(res, { error: "Método no permitido" }, 405);
}

export default withErrors("api/admin/orders/[id]", handler);
