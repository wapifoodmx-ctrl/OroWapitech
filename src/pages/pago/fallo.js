import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { PaymentReturn } from "@/components/PaymentReturn";
import { useAuth } from "@/components/SiteChrome";
import { api } from "@/lib/store/client";

export default function PagoFallo() {
  const router = useRouter();
  const { token, loading } = useAuth();
  const [remote, setRemote] = useState(null);
  const ready = router.isReady && !loading;
  const paymentId = ready ? router.query.payment_id || router.query.collection_id || "" : "";
  const ref = ready ? String(router.query.external_reference || "") : "";

  useEffect(() => {
    if (!ready || !paymentId || !token) return undefined;
    let cancel = false;
    api
      .syncPayment(String(paymentId))
      .then((data) => {
        if (!cancel) setRemote(data);
      })
      .catch(() => {
        if (!cancel) setRemote({ error: true });
      });
    return () => {
      cancel = true;
    };
  }, [ready, paymentId, token]);

  let message =
    "El pago no se completó. El pedido no se borra: queda como no pagado y la pieza vuelve al catálogo cuando Mercado Pago confirma el rechazo.";
  if (remote?.order?.paymentStatus === "pagado") {
    message = "Este pago sí quedó aprobado. Revisa el pedido en tu cuenta.";
  } else if (remote?.order?.status === "cancelado") {
    message = "El pago fue rechazado o cancelado. La pieza quedó libre y el pedido sigue en tu historial.";
  }

  const folio = remote?.order?.id || ref;

  return (
    <>
      <Head>
        <title>Pago no completado — Oro Lozano</title>
      </Head>
      <PaymentReturn kicker="Mercado Pago" title="No se completó el pago">
        <p>{message}</p>
        {folio ? <p className="text-sm text-gold">Folio: {folio}</p> : null}
      </PaymentReturn>
    </>
  );
}
