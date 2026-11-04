import { clearSession, getStoredToken, setSession } from "./auth-client";

async function request(url, init = {}) {
  const token = typeof window !== "undefined" ? getStoredToken() : null;
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Error de servidor");
  return body;
}

export const api = {
  me: () => request("/api/auth/me"),
  login: async (username, password) => {
    const data = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    if (data.token && data.user) setSession(data.token, data.user);
    return data;
  },
  register: async (payload) => {
    const data = await request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (data.token && data.user) setSession(data.token, data.user);
    return data;
  },
  forgotPassword: (email) =>
    request("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (payload) =>
    request("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: async () => {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } finally {
      clearSession();
    }
  },
  updateProfile: (payload) =>
    request("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  products: () => request("/api/products"),
  product: (id) => request(`/api/products/${id}`),
  certificate: (uuid) => request(`/api/certificates/${uuid}`),
  cart: () => request("/api/cart"),
  addToCart: (productId, quantity = 1) =>
    request("/api/cart", {
      method: "POST",
      body: JSON.stringify({ productId, quantity }),
    }),
  updateCart: (productId, quantity) =>
    request("/api/cart", {
      method: "PUT",
      body: JSON.stringify({ productId, quantity }),
    }),
  checkout: (shipping) =>
    request("/api/orders", {
      method: "POST",
      body: JSON.stringify(shipping),
    }),
  mpCheckout: (orderId) =>
    request("/api/mercadopago/checkout", {
      method: "POST",
      body: JSON.stringify({ orderId }),
    }),
  syncPayment: (paymentId) =>
    request("/api/mercadopago/sync", {
      method: "POST",
      body: JSON.stringify({ paymentId }),
    }),
  orders: () => request("/api/orders"),
  adminProducts: () => request("/api/admin/products"),
  adminCreateProduct: (product) =>
    request("/api/admin/products", {
      method: "POST",
      body: JSON.stringify(product),
    }),
  adminUpdateProduct: (id, product) =>
    request(`/api/admin/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(product),
    }),
  adminDeleteProduct: (id) =>
    request(`/api/admin/products/${id}`, { method: "DELETE" }),
  adminOrders: () => request("/api/admin/orders"),
  adminSettings: () => request("/api/admin/settings"),
  adminUpdateSettings: (payload) =>
    request("/api/admin/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  changePassword: (payload) =>
    request("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  publicSettings: () => request("/api/settings"),
  adminUploadImage: (payload) =>
    request("/api/admin/upload", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateOrderShipping: (orderId, shipping) =>
    request("/api/orders", {
      method: "PATCH",
      body: JSON.stringify({ orderId, shipping }),
    }),
  adminReleaseOrderProducts: (id) =>
    request(`/api/admin/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "release_products" }),
    }),
  adminUpdateOrder: (id, payload) =>
    request(`/api/admin/orders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};

export function formatMxn(cents) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((Number(cents) || 0) / 100);
}
