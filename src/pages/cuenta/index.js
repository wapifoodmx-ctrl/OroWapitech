import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageShell, useAuth } from "@/components/SiteChrome";
import { Toast } from "@/components/Toast";
import {
  MX_STATES,
  onlyAlnumUser,
  onlyDigits,
  onlyLettersSpaces,
  validateEmail,
  validatePhoneMx,
  validateZipMx,
} from "@/lib/store/mx-validate";
import { setSession } from "@/lib/store/auth-client";
import { statusLabel, canEditShipping, paymentLabel } from "@/lib/store/order-status";
import { api, formatMxn } from "@/lib/store/client";

const emptyShipping = {
  fullName: "",
  phone: "",
  street: "",
  extNumber: "",
  intNumber: "",
  neighborhood: "",
  city: "",
  state: "",
  zip: "",
  references: "",
  betweenStreets: "",
};

export default function Cuenta() {
  const { user, token, loading, refresh, setAuth } = useAuth();
  const [mode, setMode] = useState("login"); // login | register | forgot | reset
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [orders, setOrders] = useState([]);
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [shipping, setShipping] = useState(emptyShipping);
  const [saved, setSaved] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [recoverEmail, setRecoverEmail] = useState("");
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");
  const [currentPassword, setCurrentPassword] = useState("");
  const [changeNewPassword, setChangeNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [orderShip, setOrderShip] = useState({});

  useEffect(() => {
    if (!user) return;
    setProfile({ name: user.name || "", email: user.email || "", phone: user.phone || "" });
    setShipping({ ...emptyShipping, ...(user.shipping || {}), fullName: user.shipping?.fullName || user.name || "" });
    if (user.role !== "admin") {
      api.orders().then((d) => setOrders(d.orders)).catch(() => {});
    }
  }, [user]);

  return (
    <>
      <Head>
        <title>Cuenta — Oro Lozano</title>
      </Head>
      <PageShell>
        <Toast message={toast} type={toastType} onClose={() => setToast("")} />
        {loading ? (
          <p className="py-20 text-center text-muted">Cargando…</p>
        ) : user && token ? (
          user.role === "admin" ? (
            <section className="mx-auto max-w-2xl px-5 py-16 text-center md:px-8">
              <p className="text-xs tracking-[0.28em] uppercase text-gold">Administrador</p>
              <h1 className="mt-2 text-4xl">{user.name}</h1>
              <p className="mt-2 text-muted">@{user.username}</p>
              <p className="mx-auto mt-6 max-w-md text-sm text-muted">
                La cuenta de atelier no gestiona datos de envío personales.
                Usa el panel para piezas, certificados y despacho de pedidos.
              </p>
              <Link
                href="/admin"
                className="mt-8 inline-flex h-12 items-center rounded-full bg-gold px-8 text-xs tracking-[0.18em] uppercase text-bg"
              >
                Ir al atelier
              </Link>
            </section>
          ) : (
            <section className="mx-auto max-w-3xl px-5 py-12 md:px-8">
              <p className="text-xs tracking-[0.28em] uppercase text-gold">Cliente</p>
              <h1 className="mt-2 text-4xl">{user.name}</h1>
              <p className="mt-2 text-muted">@{user.username} · {user.email}</p>

              <form
                className="mt-12 space-y-4 rounded-[var(--radius-xl)] border border-border bg-surface p-6"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSaved("");
                  setError("");
                  const e1 = validateEmail(profile.email);
                  const e2 = validatePhoneMx(profile.phone);
                  // C.P. solo se valida si el usuario empezó a llenar dirección
                  const hasShip = Boolean(shipping.street || shipping.city || shipping.zip);
                  const e3 = hasShip ? validateZipMx(shipping.zip) : null;
                  if (e1 || e2 || e3) {
                    setError(e1 || e2 || e3);
                    setToastType("error");
                    setToast(e1 || e2 || e3);
                    return;
                  }
                  try {
                    const { user: updated } = await api.updateProfile({
                      name: onlyLettersSpaces(profile.name, 80),
                      email: profile.email.trim().toLowerCase().slice(0, 80),
                      phone: onlyDigits(profile.phone, 10),
                      shipping: {
                        ...shipping,
                        fullName: onlyLettersSpaces(shipping.fullName, 80),
                        phone: onlyDigits(shipping.phone, 10),
                        zip: onlyDigits(shipping.zip, 5),
                        street: String(shipping.street || "").slice(0, 80),
                        extNumber: String(shipping.extNumber || "").slice(0, 10),
                        intNumber: String(shipping.intNumber || "").slice(0, 10),
                        neighborhood: String(shipping.neighborhood || "").slice(0, 60),
                        city: onlyLettersSpaces(shipping.city, 60),
                        references: String(shipping.references || "").slice(0, 120),
                        betweenStreets: String(shipping.betweenStreets || "").slice(0, 80),
                      },
                    });
                    setSession(token, updated);
                    setAuth(token, updated);
                    setSaved("Datos guardados");
                    setToastType("success");
                    setToast("Datos guardados correctamente");
                    await refresh();
                  } catch (err) {
                    setError(err.message);
                    setToastType("error");
                    setToast(err.message);
                  }
                }}
              >
                <h2 className="font-display text-2xl">Datos personales</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Nombre completo" value={profile.name} onChange={(v) => setProfile({ ...profile, name: v })} />
                  <Field label="Correo" value={profile.email} onChange={(v) => setProfile({ ...profile, email: v })} />
                  <Field label="Teléfono" value={profile.phone} onChange={(v) => setProfile({ ...profile, phone: v })} />
                </div>

                <h2 className="pt-4 font-display text-2xl">Dirección de envío (México)</h2>
                <p className="text-sm text-muted">Datos para paquetería nacional.</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Nombre quien recibe" value={shipping.fullName} onChange={(v) => setShipping({ ...shipping, fullName: v })} />
                  <Field label="Teléfono de contacto" value={shipping.phone} onChange={(v) => setShipping({ ...shipping, phone: v })} />
                  <Field label="Calle" value={shipping.street} onChange={(v) => setShipping({ ...shipping, street: v })} />
                  <Field label="No. exterior" value={shipping.extNumber} onChange={(v) => setShipping({ ...shipping, extNumber: v })} />
                  <Field label="No. interior" value={shipping.intNumber} onChange={(v) => setShipping({ ...shipping, intNumber: v })} />
                  <Field label="Colonia" value={shipping.neighborhood} onChange={(v) => setShipping({ ...shipping, neighborhood: v })} />
                  <Field label="Ciudad / Municipio" value={shipping.city} onChange={(v) => setShipping({ ...shipping, city: v })} />
                  <label className="block">
                    <span className="mb-1 block text-xs tracking-[0.16em] uppercase text-subtle">Estado</span>
                    <select
                      value={shipping.state}
                      onChange={(e) => setShipping({ ...shipping, state: e.target.value })}
                      className="h-12 w-full rounded-[var(--radius-md)] border border-border bg-bg px-4"
                    >
                      <option value="">Selecciona</option>
                      {MX_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <Field label="C.P." value={shipping.zip} onChange={(v) => setShipping({ ...shipping, zip: v })} />
                  <Field label="Entre calles" value={shipping.betweenStreets} onChange={(v) => setShipping({ ...shipping, betweenStreets: v })} />
                  <div className="md:col-span-2">
                    <Field label="Referencias" value={shipping.references} onChange={(v) => setShipping({ ...shipping, references: v })} />
                  </div>
                </div>
                {error ? <p className="text-sm text-danger">{error}</p> : null}
                {saved ? <p className="text-sm text-gold">{saved}</p> : null}
                <button type="submit" className="h-12 rounded-full bg-gold px-8 text-xs tracking-[0.2em] uppercase text-bg">
                  Guardar cambios
                </button>
              </form>

              
              <form
                className="mt-10 space-y-3 rounded-[var(--radius-xl)] border border-border bg-surface p-6"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError("");
                  if (changeNewPassword !== confirmPassword) {
                    setToastType("error");
                    setToast("Las contraseñas no coinciden");
                    return;
                  }
                  try {
                    const res = await api.changePassword({ currentPassword, newPassword: changeNewPassword });
                    setToastType("success");
                    setToast(res.message || "Contraseña actualizada");
                    setCurrentPassword("");
                    setChangeNewPassword("");
                    setConfirmPassword("");
                  } catch (err) {
                    setToastType("error");
                    setToast(err.message);
                  }
                }}
              >
                <h2 className="font-display text-2xl">Cambiar contraseña</h2>
                <p className="text-sm text-muted">Si ya iniciaste sesión no necesitas OTP de recuperación.</p>
                <Field label="Contraseña actual" value={currentPassword} onChange={setCurrentPassword} type="password" />
                <Field label="Nueva contraseña (mín. 6)" value={changeNewPassword} onChange={setChangeNewPassword} type="password" />
                <Field label="Confirmar nueva" value={confirmPassword} onChange={setConfirmPassword} type="password" />
                <button type="submit" className="h-11 rounded-full bg-gold px-6 text-xs tracking-[0.18em] uppercase text-bg">
                  Actualizar contraseña
                </button>
              </form>

              <h2 className="mt-12 font-display text-2xl">Mis pedidos</h2>
              <p className="mt-1 text-sm text-muted">
                Historial permanente. Si te equivocaste en la dirección, puedes corregirla mientras el pedido
                esté recibido o confirmado.
              </p>
              <div className="mt-4 space-y-3">
                {orders.length === 0 ? (
                  <p className="text-muted">Aún no hay pedidos.</p>
                ) : (
                  orders.map((o) => (
                    <div key={o.id} className="rounded-[var(--radius-lg)] border border-border p-4">
                      <p className="text-sm text-gold">{o.id}</p>
                      <p className="tabular-nums">{formatMxn(o.total)}</p>
                      <p className={`mt-1 text-sm ${o.status === "cancelado" ? "text-danger" : "text-gold-strong"}`}>
                        {statusLabel(o.status || "recibido")}
                      </p>
                      <p className="text-sm text-muted">{paymentLabel(o.paymentStatus)}</p>
                      {(o.items || []).map((item) => (
                        <p key={item.productId} className="text-sm text-muted">
                          {item.name}
                        </p>
                      ))}
                      <p className="text-sm text-muted">
                        {o.shippingName || o.shipping?.fullName} · {o.shippingCity || o.shipping?.city}
                      </p>
                      {o.paymentStatus === "pendiente" && (o.status === "recibido" || o.status === "confirmado") ? (
                        <button
                          type="button"
                          className="mt-3 inline-flex h-10 items-center rounded-full bg-gold px-4 text-xs tracking-[0.16em] uppercase text-bg"
                          onClick={async () => {
                            try {
                              const data = await api.mpCheckout(o.id);
                              const url = data.init_point || data.sandbox_init_point;
                              if (!url) throw new Error("Mercado Pago no devolvió el link de pago");
                              window.location.href = url;
                            } catch (err) {
                              setToastType("error");
                              setToast(err.message);
                            }
                          }}
                        >
                          Continuar al pago
                        </button>
                      ) : null}

                      {canEditShipping(o.status || "recibido") ? (
                        editingOrderId === o.id ? (
                          <div className="mt-3 space-y-2 rounded-md border border-border bg-bg p-3">
                            <Field label="Nombre quien recibe" value={orderShip.fullName || ""} onChange={(v) => setOrderShip({ ...orderShip, fullName: v })} maxLength={80} />
                            <Field label="Teléfono" value={orderShip.phone || ""} onChange={(v) => setOrderShip({ ...orderShip, phone: onlyDigits(v, 10) })} maxLength={10} />
                            <Field label="Calle" value={orderShip.street || ""} onChange={(v) => setOrderShip({ ...orderShip, street: v })} maxLength={80} />
                            <Field label="No. exterior" value={orderShip.extNumber || ""} onChange={(v) => setOrderShip({ ...orderShip, extNumber: v })} maxLength={10} />
                            <Field label="No. interior" value={orderShip.intNumber || ""} onChange={(v) => setOrderShip({ ...orderShip, intNumber: v })} maxLength={10} />
                            <Field label="Colonia" value={orderShip.neighborhood || ""} onChange={(v) => setOrderShip({ ...orderShip, neighborhood: v })} maxLength={60} />
                            <Field label="Ciudad" value={orderShip.city || ""} onChange={(v) => setOrderShip({ ...orderShip, city: v })} maxLength={60} />
                            <label className="block">
                              <span className="mb-1 block text-xs tracking-[0.16em] uppercase text-subtle">Estado</span>
                              <select
                                value={orderShip.state || ""}
                                onChange={(e) => setOrderShip({ ...orderShip, state: e.target.value })}
                                className="h-12 w-full rounded-[var(--radius-md)] border border-border bg-bg px-4"
                              >
                                <option value="">Selecciona</option>
                                {MX_STATES.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </label>
                            <Field label="C.P." value={orderShip.zip || ""} onChange={(v) => setOrderShip({ ...orderShip, zip: onlyDigits(v, 5) })} maxLength={5} />
                            <Field label="Entre calles" value={orderShip.betweenStreets || ""} onChange={(v) => setOrderShip({ ...orderShip, betweenStreets: v })} maxLength={80} />
                            <Field label="Referencias" value={orderShip.references || ""} onChange={(v) => setOrderShip({ ...orderShip, references: v })} maxLength={120} />
                            <div className="flex gap-2 pt-1">
                              <button
                                type="button"
                                className="h-10 rounded-full bg-gold px-4 text-xs uppercase tracking-wide text-bg"
                                onClick={async () => {
                                  try {
                                    await api.updateOrderShipping(o.id, orderShip);
                                    setToastType("success");
                                    setToast("Dirección de envío actualizada");
                                    setEditingOrderId(null);
                                    const d = await api.orders();
                                    setOrders(d.orders || []);
                                  } catch (err) {
                                    setToastType("error");
                                    setToast(err.message);
                                  }
                                }}
                              >
                                Guardar envío
                              </button>
                              <button type="button" className="h-10 rounded-full border border-border px-4 text-xs" onClick={() => setEditingOrderId(null)}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="mt-2 text-xs text-gold hover:underline"
                            onClick={() => {
                              setEditingOrderId(o.id);
                              setOrderShip({
                                fullName: o.shipping?.fullName || o.shippingName || "",
                                phone: o.shipping?.phone || "",
                                street: o.shipping?.street || "",
                                extNumber: o.shipping?.extNumber || "",
                                intNumber: o.shipping?.intNumber || "",
                                neighborhood: o.shipping?.neighborhood || "",
                                city: o.shipping?.city || o.shippingCity || "",
                                state: o.shipping?.state || "",
                                zip: o.shipping?.zip || "",
                                references: o.shipping?.references || "",
                                betweenStreets: o.shipping?.betweenStreets || "",
                              });
                            }}
                          >
                            Corregir datos de envío
                          </button>
                        )
                      ) : null}

                      {Array.isArray(o.statusHistory) && o.statusHistory.length > 1 ? (
                        <ol className="mt-3 space-y-1 text-xs text-subtle">
                          {o.statusHistory.map((h, i) => (
                            <li key={i}>
                              {new Date(h.at).toLocaleString("es-MX")} — {statusLabel(h.status)}
                            </li>
                          ))}
                        </ol>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          )
        ) : (
          <section className="mx-auto max-w-md px-5 py-16">
            <h1 className="text-center text-4xl">
              {mode === "login" && "Entrar"}
              {mode === "register" && "Crear cuenta"}
              {mode === "forgot" && "Recuperar acceso"}
              {mode === "reset" && "Nueva contraseña"}
            </h1>
            <p className="mt-3 text-center text-sm text-muted">
              {mode === "login" || mode === "register"
                ? "Cliente: juan / uwu · Admin: hugo / 1"
                : "Te enviaremos un código OTP al correo registrado"}
            </p>

            {(mode === "login" || mode === "register") && (
              <form
                className="mt-8 space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError("");
                  try {
                    if (mode === "login") {
                      const data = await api.login(username, password);
                      setAuth(data.token, data.user);
                    } else {
                      const data = await api.register({ username, password, name, email });
                      setAuth(data.token, data.user);
                    }
                    await refresh();
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                {mode === "register" ? (
                  <>
                    <Field label="Nombre" value={name} onChange={setName} />
                    <Field label="Correo" value={email} onChange={setEmail} />
                  </>
                ) : null}
                <Field label="Usuario" value={username} onChange={setUsername} />
                <Field label="Contraseña" value={password} onChange={setPassword} type="password" />
                {error ? <p className="text-sm text-danger">{error}</p> : null}
                <button type="submit" className="h-12 w-full rounded-full bg-gold text-xs tracking-[0.2em] uppercase text-bg">
                  {mode === "login" ? "Entrar" : "Registrarme"}
                </button>
              </form>
            )}

            {mode === "forgot" && (
              <form
                className="mt-8 space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError("");
                  setSaved("");
                  try {
                    const res = await api.forgotPassword(recoverEmail);
                    setSaved(res.message || "Revisa tu correo");
                    setMode("reset");
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                <Field label="Correo registrado" value={recoverEmail} onChange={setRecoverEmail} />
                {error ? <p className="text-sm text-danger">{error}</p> : null}
                {saved ? <p className="text-sm text-gold">{saved}</p> : null}
                <button type="submit" className="h-12 w-full rounded-full bg-gold text-xs tracking-[0.2em] uppercase text-bg">
                  Enviar código OTP
                </button>
              </form>
            )}

            {mode === "reset" && (
              <form
                className="mt-8 space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError("");
                  setSaved("");
                  try {
                    const res = await api.resetPassword({
                      email: recoverEmail,
                      otp,
                      newPassword,
                    });
                    setSaved(res.message || "Contraseña actualizada");
                    setMode("login");
                    setPassword("");
                    setOtp("");
                    setNewPassword("");
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                <Field label="Correo" value={recoverEmail} onChange={setRecoverEmail} />
                <Field label="Código OTP (6 dígitos)" value={otp} onChange={setOtp} />
                <Field label="Nueva contraseña" value={newPassword} onChange={setNewPassword} type="password" />
                {error ? <p className="text-sm text-danger">{error}</p> : null}
                {saved ? <p className="text-sm text-gold">{saved}</p> : null}
                <button type="submit" className="h-12 w-full rounded-full bg-gold text-xs tracking-[0.2em] uppercase text-bg">
                  Guardar nueva contraseña
                </button>
              </form>
            )}

            <div className="mt-6 space-y-2 text-center text-sm text-muted">
              {(mode === "login" || mode === "register") && (
                <>
                  <button type="button" className="block w-full hover:text-gold" onClick={() => setMode(mode === "login" ? "register" : "login")}>
                    {mode === "login" ? "¿Nuevo? Crea tu cuenta de cliente" : "Ya tengo cuenta"}
                  </button>
                  <button type="button" className="block w-full hover:text-gold" onClick={() => { setMode("forgot"); setError(""); setSaved(""); }}>
                    ¿Olvidaste tu contraseña?
                  </button>
                </>
              )}
              {(mode === "forgot" || mode === "reset") && (
                <button type="button" className="block w-full hover:text-gold" onClick={() => setMode("login")}>
                  Volver a entrar
                </button>
              )}
            </div>
          </section>
        )}
      </PageShell>
    </>
  );
}

function Field({ label, value, onChange, type = "text", maxLength, inputMode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs tracking-[0.16em] uppercase text-subtle">{label}</span>
      <input
        type={type}
        value={value}
        maxLength={maxLength}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-[var(--radius-md)] border border-border bg-bg px-4"
      />
    </label>
  );
}
