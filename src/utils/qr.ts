import QRCode from "qrcode";
import { env } from "../config/env";

/**
 * Genera el QR (PNG en base64 data URL) que apunta a la URL pública y
 * permanente del local (Landing estilo Linktree).
 */
export async function generateLocationQr(slug: string): Promise<string> {
  const url = `${env.frontendUrl[0]}/l/${slug}`;
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });
}

export function getReviewUrl(slug: string): string {
  return `${env.frontendUrl[0]}/l/${slug}`;
}