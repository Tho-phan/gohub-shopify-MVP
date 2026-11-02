import QRCode from "qrcode";

export async function lpaToQrPng(payload: string): Promise<Buffer> {
  return QRCode.toBuffer(payload, {
    type: "png",
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
