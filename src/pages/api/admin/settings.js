import { currentUserFromRequest, json, withErrors } from "@/lib/store/http";
import { getAdminData, updateAdminData } from "@/lib/store/services";

async function handler(req, res) {
  const user = await currentUserFromRequest(req, res);
  if (!user || user.role !== "admin") return json(res, { error: "No autorizado" }, 403);

  if (req.method === "GET") {
    try {
      const settings = await getAdminData();
      return json(res, { settings });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  if (req.method === "PUT") {
    try {
      const body = req.body || {};
      const settings = await updateAdminData({
        categories: body.categories,
        goldSpotByKarat: body.goldSpotByKarat,
        marginPercent: body.marginPercent,
        ivaPercent: body.ivaPercent,
      });
      return json(res, { settings });
    } catch (e) {
      return json(res, { error: e.message }, 500);
    }
  }

  return json(res, { error: "Método no permitido" }, 405);
}

export default withErrors("api/admin/settings", handler);
