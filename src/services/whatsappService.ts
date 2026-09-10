import { env } from "../config/env";
import { notificationLogger } from "../utils/logger";

export interface WhatsappSendResult {
  ok: boolean;
  response?: unknown;
  error?: string;
}

/**
 * Capa de abstracción sobre el proveedor de WhatsApp.
 * Hoy implementa Meta WhatsApp Business Cloud API, pero el resto del
 * sistema solo conoce esta interfaz (sendWhatsappMessage), por lo que
 * cambiar de proveedor en el futuro no requiere tocar notificationService.
 *
 * Credenciales: WHATSAPP_API_TOKEN y WHATSAPP_PHONE_NUMBER_ID se
 * configuran por variables de entorno (.env), nunca hardcodeadas.
 * Ver docs/DEPLOYMENT.md para cómo obtenerlas desde Meta for Developers.
 */
export async function sendWhatsappMessage(toPhone: string, message: string): Promise<WhatsappSendResult> {
  const { apiToken, phoneNumberId, apiVersion } = env.whatsapp;

  if (!apiToken || !phoneNumberId) {
    const error = "WhatsApp no configurado (faltan WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID)";
    notificationLogger.warn(error);
    return { ok: false, error };
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toPhone,
        type: "text",
        text: { body: message },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      notificationLogger.error("Fallo al enviar WhatsApp", { status: res.status, data });
      return { ok: false, error: `HTTP ${res.status}`, response: data };
    }

    return { ok: true, response: data };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    notificationLogger.error("Excepción al enviar WhatsApp", { error: message });
    return { ok: false, error: message };
  }
}

export function buildAlertMessage(params: {
  locationName: string;
  newReviews: number;
  average: number;
  lowRatingCount: number;
  whatsappCount: number;
  emailCount: number;
  panelUrl: string;
}) {
  return (
    `📊 Nuevo resumen de reseñas\n\n` +
    `Local: ${params.locationName}\n\n` +
    `Se registraron ${params.newReviews} nuevas reseñas.\n\n` +
    `Promedio: ${params.average.toFixed(1)} ⭐\n\n` +
    `Reseñas de 1-2 estrellas: ${params.lowRatingCount}\n\n` +
    `Clientes que dejaron WhatsApp: ${params.whatsappCount}\n\n` +
    `Clientes que dejaron email: ${params.emailCount}\n\n` +
    `Ingresá al panel para verlas: ${params.panelUrl}`
  );
}
