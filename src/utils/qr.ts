import QRCode from "qrcode";
import { env } from "../config/env";

/**
 * Genera el QR (PNG en base64 data URL) que apunta a la URL pública y
 * permanente del local. La URL depende solo del slug, nunca cambia
 * salvo que el slug del local se edite explícitamente.
 */
export async function generateLocationQr(slug: string): Promise<string> {
  const url = `${env.frontendUrl}/review/${slug}`;
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 512,
  });
}

export function getReviewUrl(slug: string): string {
  return `${env.frontendUrl}/review/${slug}`;
}
