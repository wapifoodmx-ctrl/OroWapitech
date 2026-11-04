import { json, withErrors } from "@/lib/store/http";
import { getProductByCertificateUuid } from "@/lib/store/services";

async function handler(req, res) {
  if (req.method !== "GET") return json(res, { error: "Método no permitido" }, 405);
  const product = await getProductByCertificateUuid(req.query.uuid);
  if (!product || !product.active) return json(res, { error: "Certificado no encontrado" }, 404);
  return json(res, {
    certificate: product.certificate,
    product: {
      id: product.id,
      name: product.name,
      metal: product.metal,
      purity: product.purity || product.karat,
      weightGrams: product.weightGrams,
      image: product.image,
      category: product.category,
      stones: product.stones || "none",
    },
  });
}

export default withErrors("api/certificates/[uuid]", handler);
