import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { PaymentReturn } from "@/components/PaymentReturn";
import { useAuth } from "@/components/SiteChrome";
import { api } from "@/lib/store/client";

export default function PagoExito() {
  const router = useRouter();
  const { token, loading } = useAuth();
  const [remote, setRemote] = useState(null);
  const ready = router.isReady && !loading;
  const status = ready ? String(router.query.collection_status || router.query.status || "") : "";
  const paymentId = ready ? router.query.payment_id || router.query.collection_id || "" : "";
  const ref = ready ? String(router.query.external_reference || "") : "";
  const rejected = Boolean(status && status !== "approved" && status !== "success");

  useEffect(() => {
    if (!ready || rejected || !paymentId || !token) return undefined;
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
  }, [ready, rejected, paymentId, token]);

  let message = "Estamos confirmando el pago con Mercado Pago.";
  if (rejected) {
    message = "Mercado Pago no marcó este pago como aprobado. Revisa el pedido en tu cuenta.";
  } else if (ready && (!paymentId || !token)) {
    message = "Si el cargo fue aprobado, el pedido pasa a confirmado en cuanto llegue la notificación.";
  } else if (remote?.error) {
    message = "El webhook confirmará el pago en breve. Puedes seguir el pedido en tu cuenta.";
  } else if (remote?.order?.paymentStatus === "pagado") {
    message = "Pago acreditado. El atelier ya puede preparar el envío.";
  } else if (remote?.result?.conflict) {
    message = "El pago se acreditó, pero la pieza ya no estaba disponible. Escríbenos para revisarlo.";
  } else if (remote) {
    message = "Recibimos la respuesta de Mercado Pago. El estado queda en Mis pedidos.";
  }

  const folio = remote?.order?.id || ref;

  return (
    <>
      <Head>
        <title>Pago recibido — Oro Lozano</title>
      </Head>
      <PaymentReturn kicker="Mercado Pago" title="Pago recibido">
        <p>{message}</p>
        {folio ? <p className="text-sm text-gold">Folio: {folio}</p> : null}
      </PaymentReturn>
    </>
  );
}
