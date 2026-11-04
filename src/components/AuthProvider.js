import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearSession, setSession } from "@/lib/store/auth-client";
import { api } from "@/lib/store/client";
import { mergeGuestCart } from "@/lib/store/guest-cart";

const AuthContext = createContext({
  user: null,
  token: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
  setAuth: () => {},
});

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const mergedFor = useRef("");

  const refresh = useCallback(async () => {
    try {
      const data = await api.me();
      if (data.user) {
        setUser(data.user);
        setToken("session");
        setSession("session", data.user);
      } else {
        clearSession();
        setUser(null);
        setToken(null);
      }
    } catch (error) {
      console.error("[orolozano] sesion", error?.message || error);
      clearSession();
      setUser(null);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
    setToken(null);
  }, []);

  const setAuth = useCallback((nextToken, nextUser) => {
    setSession(nextToken, nextUser);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh();
    }, 0);
    const onAuth = () => {
      refresh();
    };
    window.addEventListener("ol-auth-change", onAuth);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("ol-auth-change", onAuth);
    };
  }, [refresh]);

  useEffect(() => {
    if (loading || !user || user.role === "admin") {
      if (!user) mergedFor.current = "";
      return;
    }
    if (mergedFor.current === user.id) return;
    mergedFor.current = user.id;
    mergeGuestCart()
      .then((result) => {
        if (result?.dropped) {
          sessionStorage.setItem(
            "ol_cart_notice",
            "Algunas piezas del carrito ya no estaban disponibles",
          );
        }
        window.dispatchEvent(new Event("ol-cart-change"));
      })
      .catch(() => {
        mergedFor.current = "";
      });
  }, [loading, user]);

  const value = useMemo(
    () => ({ user, token, loading, refresh, logout, setAuth }),
    [user, token, loading, refresh, logout, setAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
