import { json, withErrors } from "@/lib/store/http";
import { getAdminData } from "@/lib/store/services";

/** Público: categorías activas para filtros de tienda */
async function handler(req, res) {
  if (req.method !== "GET") return json(res, { error: "Método no permitido" }, 405);
  try {
    const settings = await getAdminData();
    return json(res, {
      categories: settings.categories || [],
    });
  } catch (e) {
    return json(res, {
      categories: [
        { id: "anillos", name: "Anillos", slug: "anillos" },
        { id: "collares", name: "Collares", slug: "collares" },
        { id: "aretes", name: "Aretes", slug: "aretes" },
        { id: "pulseras", name: "Pulseras", slug: "pulseras" },
      ],
    });
  }
}

export default withErrors("api/settings", handler);
