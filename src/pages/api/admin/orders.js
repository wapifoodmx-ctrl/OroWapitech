import { currentUserFromRequest, json, withErrors } from "@/lib/store/http";
import { listOrders } from "@/lib/store/services";

async function handler(req, res) {
  if (req.method !== "GET") return json(res, { error: "Método no permitido" }, 405);
  const user = await currentUserFromRequest(req, res);
  if (!user || user.role !== "admin") return json(res, { error: "No autorizado" }, 403);
  const orders = await listOrders();
  // Never delete — always return full history
  return json(res, { orders });
}

export default withErrors("api/admin/orders", handler);
