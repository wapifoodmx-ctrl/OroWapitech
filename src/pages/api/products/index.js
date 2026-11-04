import { json, withErrors } from "@/lib/store/http";
import { listProducts } from "@/lib/store/services";

async function handler(req, res) {
  if (req.method !== "GET") return json(res, { error: "Método no permitido" }, 405);
  const products = await listProducts();
  return json(res, { products });
}

export default withErrors("api/products/index", handler);
