import { json } from "@/lib/store/http";
import { getProduct } from "@/lib/store/services";

export default async function handler(req, res) {
  if (req.method !== "GET") return json(res, { error: "Método no permitido" }, 405);
  const product = await getProduct(req.query.id);
  if (!product || !product.active || product.sold || product.reservedOrderId) {
    return json(res, { error: "No encontrado" }, 404);
  }
  return json(res, { product });
}
