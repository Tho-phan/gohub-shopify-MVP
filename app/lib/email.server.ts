import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface EsimEmailItem {
  planName: string;
  iccid: string;
  lpa: string;
  qrPng: Buffer;
}

export async function sendEsimEmail(opts: {
  to: string;
  orderName: string;
  items: EsimEmailItem[];
}): Promise<void> {
  const { to, orderName, items } = opts;
  const from = process.env.EMAIL_FROM ?? "GoHub eSIM <esim@example.com>";

  const html = `
    <h2>Your eSIM${items.length > 1 ? "s" : ""} for ${orderName}</h2>
    <p>Scan the QR code${items.length > 1 ? "s" : ""} below, or install manually with the activation (LPA) string.</p>
    ${items
      .map(
        (it, i) => `
      <div style="margin:24px 0;padding:16px;border:1px solid #ddd;border-radius:8px">
        <h3 style="margin:0 0 8px">${it.planName}</h3>
        <img src="cid:qr${i}" alt="eSIM QR" width="256" height="256" style="display:block"/>
        <p style="font-family:monospace;font-size:12px;word-break:break-all">${it.lpa}</p>
        <p style="color:#666;font-size:12px">ICCID: ${it.iccid}</p>
      </div>`,
      )
      .join("")}
    <p style="color:#888;font-size:12px">iPhone: Settings -> Cellular -> Add eSIM -> Use QR Code. Android: Settings -> Network -> SIMs -> Add eSIM.</p>
  `;

  const attachments = items.map((it, i) => ({
    filename: `esim-${it.iccid}.png`,
    content: it.qrPng,
    cid: `qr${i}`,
  }));

  if ((process.env.EMAIL_TRANSPORT ?? "console") === "smtp") {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({
      from,
      to,
      subject: `Your eSIM for ${orderName}`,
      html,
      attachments,
    });
    return;
  }

  // console/dev transport: log + dump QR files to disk
  const dir = path.join(process.cwd(), "tmp", "emails");
  await mkdir(dir, { recursive: true });
  for (const it of items) {
    await writeFile(
      path.join(dir, `${orderName.replace(/\W+/g, "_")}-${it.iccid}.png`),
      it.qrPng,
    );
  }
  console.log(
    `[email:console] -> ${to} | ${orderName} | ${items.length} eSIM(s): ${items
      .map((i) => i.iccid)
      .join(", ")} | QR PNGs written to tmp/emails/`,
  );
}
