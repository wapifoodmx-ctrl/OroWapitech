import { currentUserFromRequest, json, withErrors } from "@/lib/store/http";
import { uploadProductImage } from "@/lib/store/services";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "6mb",
    },
  },
};

async function handler(req, res) {
  if (req.method !== "POST") return json(res, { error: "Método no permitido" }, 405);
  const user = await currentUserFromRequest(req, res);
  if (!user || user.role !== "admin") return json(res, { error: "No autorizado" }, 403);

  const { filename, contentType, dataBase64 } = req.body || {};
  if (!filename || !dataBase64) {
    return json(res, { error: "filename y dataBase64 son requeridos" }, 400);
  }
  try {
    const buffer = Buffer.from(dataBase64, "base64");
    const url = await uploadProductImage(
      filename,
      buffer,
      contentType || "image/jpeg",
    );
    return json(res, { url });
  } catch (err) {
    return json(res, { error: err.message || "Error al subir" }, 500);
  }
}

export default withErrors("api/admin/upload", handler);
