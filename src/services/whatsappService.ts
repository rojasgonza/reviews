import { env } from "../config/env";
import { notificationLogger } from "../utils/logger";

/* ---------------------------------- Types --------------------------------- */

export interface WhatsappSendResult {
  ok: boolean;
  /** ID del mensaje devuelto por Evolution (key.id) si el envío fue exitoso. */
  messageId?: string;
  /** Código de error HTTP de Evolution, si vino. */
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

const SEND_TIMEOUT_MS = 10_000;

/* ------------------------------- Normalización ---------------------------- */

/**
 * Normaliza un teléfono al formato que espera Evolution API (E.164 sin "+").
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

/**
 * Arma el texto del mensaje de alerta.
 *
 * A diferencia de Meta Cloud API, Evolution API (WhatsApp Web/Baileys) no
 * exige un template pre-aprobado ni respeta la ventana de 24h de mensajes
 * "business-initiated": manda texto libre desde el número conectado.
 * Si más adelante querés cambiar la redacción, es el único lugar a tocar.
 */
function buildAlertMessage(params: AlertTemplateParams): string {
  return (
    `*${params.locationName}* — nuevas reseñas\n\n` +
    `📝 Reseñas nuevas: ${params.newReviews}\n` +
    `⭐ Promedio: ${params.average.toFixed(1)}\n` +
    `⚠️ Con calificación baja (≤2): ${params.lowRatingCount}\n` +
    `📱 Con WhatsApp: ${params.whatsappCount}\n` +
    `✉️ Con email: ${params.emailCount}\n\n` +
    `Ver panel: ${params.panelUrl}`
  );
}

function extractMessageId(data: unknown): string | undefined {
  const id = (data as { key?: { id?: string } })?.key?.id;
  return typeof id === "string" ? id : undefined;
}

function extractErrorMessage(data: unknown): string | undefined {
  const d = data as {
    message?: string | string[];
    error?: string;
    response?: { message?: string | string[] };
  };
  const msg = d?.response?.message ?? d?.message ?? d?.error;
  if (Array.isArray(msg)) return msg.join(", ");
  return typeof msg === "string" ? msg : undefined;
}

/* ------------------------------ sendWhatsapp ------------------------------ */

/**
 * Capa de abstracción sobre el proveedor de WhatsApp.
 * Ahora implementa Evolution API (self-hosted, WhatsApp Web/Baileys), pero
 * el resto del sistema solo conoce esta interfaz (sendWhatsappMessage), por
 * lo que cambiar de proveedor en el futuro no requiere tocar
 * notificationService.ts ni nada que dependa de él.
 *
 * Credenciales: EVOLUTION_API_URL, EVOLUTION_API_KEY y EVOLUTION_INSTANCE
 * se configuran por variables de entorno (.env), nunca hardcodeadas.
 */
export async function sendWhatsappMessage(
  toPhone: string,
  params: AlertTemplateParams,
): Promise<WhatsappSendResult> {
  const { baseUrl, apiKey, instance } = env.evolutionApi;

  if (!baseUrl || !apiKey || !instance) {
    const error =
      "Evolution API no configurada (faltan EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE)";
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

  const url = `${baseUrl}/message/sendText/${instance}`;

  const body = JSON.stringify({
    number: normalized,
    text: buildAlertMessage(params),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body,
      signal: controller.signal,
    });

    // Evolution puede devolver HTML o texto plano en errores de infra: parseo defensivo.
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 500) };
    }

    if (!res.ok) {
      const isAuthError = res.status === 401 || res.status === 403;
      const detail = extractErrorMessage(data);

      const error = isAuthError
        ? "Autenticación con Evolution API falló. Revisá EVOLUTION_API_KEY."
        : `HTTP ${res.status}${detail ? ` (${detail})` : ""}`;

      notificationLogger.error("Fallo al enviar WhatsApp (Evolution API)", {
        status: res.status,
        data,
      });

      return { ok: false, error, providerCode: res.status, response: data };
    }

    const messageId = extractMessageId(data);
    notificationLogger.info("WhatsApp enviado (Evolution API)", {
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

    notificationLogger.error("Excepción al enviar WhatsApp (Evolution API)", { error: message });
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
