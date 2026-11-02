import db from "../db.server"; // template exports the PrismaClient as default from app/db.server
import { getGoHub } from "../gohub.server";
import { lpaToQrPng } from "./qr.server";
import { sendEsimEmail, type EsimEmailItem } from "./email.server";

interface OrderLineItem {
  id: number;
  variant_id: number | null;
  title: string;
  quantity: number;
}
interface OrderPayload {
  id: number;
  name: string; // "#1001"
  email: string | null;
  contact_email?: string | null;
  line_items: OrderLineItem[];
}

export async function provisionOrder(
  shop: string,
  order: OrderPayload,
): Promise<void> {
  const customerEmail = order.email ?? order.contact_email ?? "";
  const gohub = getGoHub();

  // 1. Which line items map to a GoHub plan we pushed for this shop?
  const variantIds = order.line_items
    .map((li) => String(li.variant_id))
    .filter(Boolean);
  const mappings = await db.resellerPlan.findMany({
    where: { shop, shopifyVariantNumericId: { in: variantIds } },
  });
  const byVariant = new Map(
    mappings.map((m) => [m.shopifyVariantNumericId!, m]),
  );

  const emailItems: EsimEmailItem[] = [];
  let anyNew = false;

  // 2. Provision each eSIM unit (idempotent).
  for (const li of order.line_items) {
    const mapping = byVariant.get(String(li.variant_id));
    if (!mapping) continue; // not a GoHub eSIM line item

    for (let index = 0; index < Math.max(1, li.quantity); index++) {
      const idempotencyKey = `${order.id}:${li.id}:${index}`;

      let esim = await db.provisionedEsim.findUnique({
        where: { idempotencyKey },
      });
      if (!esim) {
        const result = await gohub.provision({
          planId: mapping.gohubPlanId,
          idempotencyKey,
        });
        esim = await db.provisionedEsim.create({
          data: {
            shop,
            idempotencyKey,
            shopifyOrderId: String(order.id),
            shopifyOrderName: order.name,
            shopifyLineItemId: String(li.id),
            gohubPlanId: mapping.gohubPlanId,
            planName: li.title,
            iccid: result.iccid,
            lpa: result.lpa,
            status: result.status,
            customerEmail,
          },
        });
        anyNew = true;
      }

      emailItems.push({
        planName: esim.planName,
        iccid: esim.iccid,
        lpa: esim.lpa,
        qrPng: await lpaToQrPng(esim.lpa),
      });
    }
  }

  // 3. Email once per order (only if we actually provisioned something new & have an address).
  if (anyNew && customerEmail && emailItems.length > 0) {
    await sendEsimEmail({
      to: customerEmail,
      orderName: order.name,
      items: emailItems,
    });
    await db.provisionedEsim.updateMany({
      where: { shopifyOrderId: String(order.id), emailSentAt: null },
      data: { emailSentAt: new Date() },
    });
  }
}
