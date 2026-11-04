import { currentUserFromRequest, json, withErrors } from "@/lib/store/http";
import { createProduct, listProducts } from "@/lib/store/services";

async function handler(req, res) {
  const user = await currentUserFromRequest(req, res);
  if (!user || user.role !== "admin") return json(res, { error: "No autorizado" }, 403);

  if (req.method === "GET") {
    const products = await listProducts({ includeHidden: true });
    return json(res, { products });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    if (!body.name || !body.price) {
      return json(res, { error: "Nombre y precio son requeridos" }, 400);
    }
    const product = await createProduct({
      name: body.name,
      slug: (body.slug || body.name).toLowerCase().replace(/\s+/g, "-"),
      category: body.category || "anillos",
      description: body.description || "",
      details: body.details || "",
      metal: body.metal || "Oro amarillo",
      purity: body.purity || body.karat || "18k",
      weightGrams: Number(body.weightGrams || 0),
      price: Number(body.price),
      image: body.image || "/products/anillo-sello.svg",
      images: body.images || [body.image || "/products/anillo-sello.svg"],
      featured: Boolean(body.featured),
      active: body.active !== false,
      certificate: body.certificate || {},
    });
    return json(res, { product }, 201);
  }

  return json(res, { error: "Método no permitido" }, 405);
}

export default withErrors("api/admin/products/index", handler);
