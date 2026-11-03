import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { PaymentReturn } from "@/components/PaymentReturn";
import { useAuth } from "@/components/SiteChrome";
import { api } from "@/lib/store/client";
import { paymentLabel } from "@/lib/store/order-status";

export default function PagoPendiente() {
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
    "Tu pago sigue pendiente. La pieza queda reservada hasta que Mercado Pago lo confirme o lo rechace.";
  if (remote?.order?.paymentStatus === "pagado") {
    message = "El pago ya quedó acreditado. Puedes ver el pedido confirmado en tu cuenta.";
  } else if (remote?.order?.paymentStatus) {
    message = `${paymentLabel(remote.order.paymentStatus)}. Si pagaste en efectivo, la confirmación puede tardar.`;
  }

  const folio = remote?.order?.id || ref;

  return (
    <>
      <Head>
        <title>Pago pendiente — Oro Lozano</title>
      </Head>
      <PaymentReturn kicker="Mercado Pago" title="Pago pendiente">
        <p>{message}</p>
        {folio ? <p className="text-sm text-gold">Folio: {folio}</p> : null}
      </PaymentReturn>
    </>
  );
}
