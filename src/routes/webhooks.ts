import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { notificationLogger } from "../utils/logger";

const router = Router();

// 1. Verificación inicial (Meta llama a tu webhook con ?hub.mode=subscribe)
router.get("/webhooks/whatsapp", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.whatsapp.webhookVerifyToken) {
    notificationLogger.info("Webhook verificado por Meta");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 2. Eventos (Meta manda POST cada vez que pasa algo)
router.post("/webhooks/whatsapp", (req: Request, res: Response) => {
  const body = req.body;
  const entry = body?.entry?.[0];
  const changes = entry?.changes?.[0]?.value;

  // Statuses de mensajes enviados
  if (changes?.statuses) {
    for (const status of changes.statuses) {
      notificationLogger.info("WhatsApp status", {
        messageId: status.id,
        status: status.status,        // sent | delivered | read | failed
        recipient: status.recipient_id,
        errors: status.errors,        // si falló
      });
    }
  }

  // Mensajes entrantes (respuestas de clientes)
  if (changes?.messages) {
    for (const msg of changes.messages) {
      notificationLogger.info("WhatsApp mensaje entrante", {
        from: msg.from,
        text: msg.text?.body,
      });
    }
  }

  // Siempre responder 200 rápido, si no Meta reintenta
  res.sendStatus(200);
});

export default router;