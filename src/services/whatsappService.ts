import { env } from "../config/env";
import { notificationLogger } from "../utils/logger";

/* ---------------------------------- Types --------------------------------- */

export interface WhatsappSendResult {
  ok: boolean;
  /** ID del mensaje en Meta (wamid.xxx) si el envío fue exitoso. */
  messageId?: string;
  /** Código de error de Meta, si vino (ej: 131047 = re-engagement). */
  providerCode?: number;
  error?: string;
  response?: unknown;
}

export interface AlertTemplateParams {
  locationName: string;
  newReviews: number;
  average: number;
  lowRatingCount: number;
  whatsappCount: number;
  emailCount: number;
  panelUrl: string;
}

/* -------------------------------- Constants ------------------------------- */

/**
 * Nombre del template aprobado en Meta WhatsApp Manager.
 * Debe coincidir exactamente con el que creaste en:
 * WhatsApp Manager → Message Templates → Create Template.
 *
 * El template debe tener 7 variables en el body, en este orden:
 *   {{1}} locationName
 *   {{2}} newReviews
 *   {{3}} average
 *   {{4}} lowRatingCount
 *   {{5}} whatsappCount
 *   {{6}} emailCount
 *   {{7}} panelUrl
 */
const ALERT_TEMPLATE_NAME = "resumen_resenas";
const ALERT_TEMPLATE_LANG = "es_AR";

const SEND_TIMEOUT_MS = 10_000;

/* ------------------------------- Normalización ---------------------------- */

/**
 * Normaliza un teléfono al formato que exige Meta WhatsApp Cloud API.
 *
 * Reglas:
 * - Argentina (+54): los móviles requieren `9` después del `54`.
 *   "11 2345 6789"        → "5491123456789"
 *   "+54 11 2345 6789"    → "5491123456789"
 *   "+54 9 11 2345 6789"  → "5491123456789"  (no duplica el 9)
 *   "5491123456789"       → "5491123456789"  (idempotente)
 *   "011 2345 6789"       → "5491123456789"
 *
 * - Otros países: E.164 sin `+` ni separadores.
 *   "+56 9 1234 5678"     → "56912345678"
 *
 * Devuelve `null` si el número no es válido.
 */
export function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // --- Caso Argentina ---
  let ar = digits;
  if (ar.startsWith("54")) ar = ar.slice(2); // sacar prefijo país
  if (ar.startsWith("0")) ar = ar.slice(1);  // sacar 0 de marcado nacional
  if (ar.startsWith("9")) ar = ar.slice(1);  // sacar 9 si ya venía (formato WhatsApp)
  if (/^\d{10,11}$/.test(ar)) {
    return `549${ar}`;
  }

  // --- Otros países (E.164) ---
  if (/^\d{8,15}$/.test(digits)) {
    return digits;
  }

  return null;
}

/* ------------------------------- Helpers ---------------------------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractMessageId(data: unknown): string | undefined {
  const id = (data as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id;
  return typeof id === "string" ? id : undefined;
}

function extractProviderCode(data: unknown): number | undefined {
  const code = (data as { error?: { code?: number } })?.error?.code;
  return typeof code === "number" ? code : undefined;
}

/* ------------------------------ sendWhatsapp ------------------------------ */

/**
 * Capa de abstracción sobre el proveedor de WhatsApp.
 * Hoy implementa Meta WhatsApp Business Cloud API, pero el resto del
 * sistema solo conoce esta interfaz (sendWhatsappMessage), por lo que
 * cambiar de proveedor en el futuro no requiere tocar notificationService.
 *
 * IMPORTANTE: enviamos un **template aprobado**, no texto libre, porque
 * las alertas son business-initiated (fuera de la ventana de 24h).
 * Enviar `type: "text"` a un usuario que no nos escribió en las últimas
 * 24h devuelve error 131047 "Re-engagement message".
 *
 * Credenciales: WHATSAPP_API_TOKEN y WHATSAPP_PHONE_NUMBER_ID se
 * configuran por variables de entorno (.env), nunca hardcodeadas.
 * Ver docs/DEPLOYMENT.md para cómo obtenerlas desde Meta for Developers.
 */
export async function sendWhatsappMessage(
  toPhone: string,
  params: AlertTemplateParams,
): Promise<WhatsappSendResult> {
  const { apiToken, phoneNumberId, apiVersion } = env.whatsapp;

  if (!apiToken || !phoneNumberId) {
    const error =
      "WhatsApp no configurado (faltan WHATSAPP_API_TOKEN / WHATSAPP_PHONE_NUMBER_ID)";
    notificationLogger.warn(error);
    return { ok: false, error };
  }

  const normalized = normalizeWhatsappPhone(toPhone);
  if (!normalized) {
    const error = `Teléfono inválido: ${toPhone}`;
    notificationLogger.warn(error);
    return { ok: false, error };
  }

  if (normalized !== toPhone) {
    notificationLogger.info("WhatsApp phone normalizado", {
      input: toPhone,
      normalized,
    });
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const body = JSON.stringify({
    messaging_product: "whatsapp",
    to: normalized,
    type: "template",
    template: {
      name: ALERT_TEMPLATE_NAME,
      language: { code: ALERT_TEMPLATE_LANG },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.locationName },
            { type: "text", text: String(params.newReviews) },
            { type: "text", text: params.average.toFixed(1) },
            { type: "text", text: String(params.lowRatingCount) },
            { type: "text", text: String(params.whatsappCount) },
            { type: "text", text: String(params.emailCount) },
            { type: "text", text: params.panelUrl },
          ],
        },
      ],
    },
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body,
      signal: controller.signal,
    });

    // Meta puede devolver HTML en errores de infra (502/504): parseo defensivo.
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }

    if (!res.ok) {
      const providerCode = extractProviderCode(data);
      const isAuthError = res.status === 401 || providerCode === 190;

      const error = isAuthError
        ? `Autenticación con Meta falló (code ${providerCode ?? 190}). Revisá WHATSAPP_API_TOKEN.`
        : `HTTP ${res.status}${providerCode ? ` (Meta code ${providerCode})` : ""}`;

      notificationLogger.error("Fallo al enviar WhatsApp", {
        status: res.status,
        providerCode,
        data,
      });

      return { ok: false, error, providerCode, response: data };
    }

    const messageId = extractMessageId(data);
    notificationLogger.info("WhatsApp enviado", {
      to: normalized,
      messageId,
    });

    return { ok: true, messageId, response: data };
  } catch (err) {
    const isAbort = (err as { name?: string })?.name === "AbortError";
    const message = isAbort
      ? `Timeout tras ${SEND_TIMEOUT_MS}ms`
      : err instanceof Error
        ? err.message
        : "Error desconocido";

    notificationLogger.error("Excepción al enviar WhatsApp", { error: message });
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}