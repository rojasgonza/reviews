import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { notificationLogger } from "../utils/logger";

const router = Router();

/**
 * Webhook de Evolution API.
 *
 * A diferencia de Meta, Evolution NO hace un handshake de verificación (no
 * hay GET con hub.challenge): simplemente hace POST a la URL que configures
 * en el Manager (Instance Settings → Webhook) cada vez que ocurre un evento.
 *
 * Para configurarlo en el Manager de Evolution:
 *   Webhook URL: https://tu-backend.com/webhooks/whatsapp?token=EVOLUTION_WEBHOOK_TOKEN
 *   Events: recomendado activar al menos MESSAGES_UPSERT y SEND_MESSAGE
 *
 * El "token" en la query string es un secreto propio (no lo define
 * Evolution) para que no cualquiera pueda pegarle a este endpoint.
 * Configurá EVOLUTION_WEBHOOK_TOKEN en tu .env con el mismo valor.
 */
router.post("/webhooks/whatsapp", (req: Request, res: Response) => {
  const expectedToken = env.evolutionApi.webhookToken;
  if (expectedToken && req.query.token !== expectedToken) {
    return res.sendStatus(403);
  }

  const { event, instance, data } = req.body ?? {};

  switch (event) {
    // Mensajes entrantes o salientes (según fromMe)
    case "messages.upsert": {
      const key = data?.key ?? {};
      const text =
        data?.message?.conversation ?? data?.message?.extendedTextMessage?.text ?? undefined;

      if (key.fromMe) {
        notificationLogger.info("WhatsApp mensaje saliente (Evolution)", {
          instance,
          to: key.remoteJid,
          messageId: key.id,
        });
      } else {
        notificationLogger.info("WhatsApp mensaje entrante (Evolution)", {
          instance,
          from: key.remoteJid,
          text,
        });
      }
      break;
    }

    // Cambios de estado de un mensaje ya enviado (sent/delivered/read/failed)
    case "messages.update": {
      notificationLogger.info("WhatsApp status (Evolution)", {
        instance,
        messageId: data?.keyId ?? data?.key?.id,
        status: data?.status,
      });
      break;
    }

    // Cambios de conexión de la instancia (útil para detectar si se desvinculó el QR)
    case "connection.update": {
      notificationLogger.info("Estado de conexión de Evolution", {
        instance,
        state: data?.state,
      });
      break;
    }

    default: {
      notificationLogger.info("Evento de Evolution sin manejar", { event, instance });
    }
  }

  // Siempre responder 200 rápido, si no Evolution puede reintentar.
  res.sendStatus(200);
});

export default router;
