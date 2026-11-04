import { currentUserFromRequest, json } from "@/lib/store/http";
import { getProduct, softDeleteProduct, updateProduct } from "@/lib/store/services";

export default async function handler(req, res) {
  const user = await currentUserFromRequest(req);
  if (!user || user.role !== "admin") return json(res, { error: "No autorizado" }, 403);
  const { id } = req.query;

  if (req.method === "PUT") {
    const current = await getProduct(id);
    if (!current) return json(res, { error: "No encontrado" }, 404);
    if (current.sold || current.reservedOrderId) {
      return json(res, { error: "Pieza vendida o reservada: solo lectura hasta liberarla" }, 409);
    }
    const body = { ...(req.body || {}) };
    delete body.sold;
    delete body.stock;
    delete body.reservedOrderId;
    delete body.reservedAt;
    if (body.active !== false) body.stock = 1;
    const product = await updateProduct(id, body);
    return json(res, { product });
  }

  if (req.method === "DELETE") {
    const current = await getProduct(id);
    if (!current) return json(res, { error: "No encontrado" }, 404);
    if (current.sold || current.reservedOrderId) {
      return json(res, { error: "No se puede ocultar una pieza vendida o reservada" }, 409);
    }
    await softDeleteProduct(id);
    return json(res, { ok: true });
  }

  return json(res, { error: "Método no permitido" }, 405);
}
