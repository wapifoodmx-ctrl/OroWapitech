import assert from "node:assert/strict";
import test from "node:test";
import { readServerEnv, supabaseSecretKey, supabaseUrl } from "../src/lib/store/env.js";
import { resolveRole, safeNextPath } from "../src/lib/store/roles.js";
import { withErrors } from "../src/lib/store/http.js";

test("la llave de servicio se lee aunque no exista SUPABASE_SECRET_KEY", () => {
  const previousSecret = process.env.SUPABASE_SECRET_KEY;
  const previousRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-de-prueba";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ejemplo.supabase.co";
  try {
    assert.equal(supabaseSecretKey(), "service-role-de-prueba");
    assert.equal(supabaseUrl(), "https://ejemplo.supabase.co");
    assert.equal(readServerEnv("NO_EXISTE"), "");
  } finally {
    if (previousSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousSecret;
    if (previousRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previousRole;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  }
});

test("solo app_metadata o el perfil pueden ser admin", () => {
  assert.equal(resolveRole({ role: "customer" }, { app_metadata: { role: "admin" } }), "admin");
  assert.equal(resolveRole({ role: "admin" }, { user_metadata: { role: "customer" } }), "admin");
  assert.equal(resolveRole({ role: "customer" }, { user_metadata: { role: "admin" } }), "customer");
  assert.equal(resolveRole({ role: "customer" }, {}), "customer");
});

test("el retorno del correo no puede salir del sitio", () => {
  assert.equal(safeNextPath("/cuenta/restablecer"), "/cuenta/restablecer");
  assert.equal(safeNextPath("https://otro.example"), "/cuenta");
  assert.equal(safeNextPath("//otro.example"), "/cuenta");
});

test("un fallo de API responde JSON con el mensaje", async () => {
  const res = {
    statusCode: 0,
    body: null,
    headersSent: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
    },
  };
  const handler = withErrors("prueba", async () => {
    const error = new Error("Faltan variables de Supabase en el servidor: SUPABASE_SERVICE_ROLE_KEY");
    error.status = 500;
    throw error;
  });
  await handler({ method: "POST" }, res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /SUPABASE_SERVICE_ROLE_KEY/);
});
