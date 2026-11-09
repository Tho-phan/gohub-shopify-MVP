import type { GohubOrder } from "@prisma/client";
import db from "../db.server";
import { getGoHub, GoHubError } from "../gohub.server";
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

interface OrderItem {
  code: string;
  quantity: number;
}

const CURRENCY = process.env.GOHUB_CURRENCY ?? "USD";

/**
 * Called by the orders/paid webhook. Records the paid order and places the
 * matching GoHub order (which charges the reseller's prepaid wallet). Idempotent
 * on the Shopify order id: a webhook retry or a duplicate paid event never
 * places a second GoHub order.
 *
 * Provisioning is async — GoHub returns the eSIMs only once we poll — so the
 * worker ({@link pollPendingGohubOrders}) finalises the order later.
 *
 * Throws only on an unexpected (non-GoHub) error, so the webhook returns 500 and
 * Shopify retries. A transient GoHub error leaves the order PENDING with no code
 * for the poller to re-place; a terminal one is recorded (FAILED / NO_BALANCE).
 */
export async function startProvision(
  shop: string,
  order: OrderPayload,
): Promise<void> {
  const idempotencyKey = String(order.id);
  const customerEmail = order.email ?? order.contact_email ?? "";

  // 1. Which line items map to a GoHub plan this shop pushed?
  const items = await resolveOrderItems(shop, order.line_items);
  if (items.length === 0) return; // nothing to provision

  // 2. Idempotency: one GoHub order per Shopify order. Skip only when it is
  //    already placed (has an order code) or finished. A PENDING row that never
  //    got a code (a transient failure) must fall through and be (re)placed.
  const existing = await db.gohubOrder.findUnique({ where: { idempotencyKey } });
  if (existing && (existing.status === "FULFILLED" || existing.gohubOrderCode)) {
    return;
  }

  const rec = await db.gohubOrder.upsert({
    where: { idempotencyKey },
    update: { status: "PENDING", lastError: null, items: JSON.stringify(items) },
    create: {
      shop,
      idempotencyKey,
      shopifyOrderId: String(order.id),
      shopifyOrderName: order.name,
      customerEmail,
      currency: CURRENCY,
      items: JSON.stringify(items),
      status: "PENDING",
    },
  });

  // Placing the order can throw an unexpected (non-GoHub) error — let it
  // propagate so the webhook returns 500 and Shopify retries.
  await placeGohubOrder(rec);
}

/**
 * Polled by the worker. Does two jobs for PENDING orders:
 *  - no order code yet  → (re)place the GoHub order (a transient failure, or a
 *    retry the webhook could not do). Safe to repeat: GoHub replays the same
 *    Idempotency-Key, so it never double-charges.
 *  - has an order code  → poll GET /orders/{code}; GoHub only provisions when we
 *    poll. Finalise on "fulfilled", mark FAILED on "failed".
 */
export async function pollPendingGohubOrders(): Promise<void> {
  const pending = await db.gohubOrder.findMany({
    where: { status: "PENDING" },
    take: 25,
  });

  for (const rec of pending) {
    try {
      if (!rec.gohubOrderCode) {
        await placeGohubOrder(rec);
        continue;
      }
      const order = await getGoHub().getOrder(rec.gohubOrderCode);
      await db.gohubOrder.update({
        where: { id: rec.id },
        data: { attempts: { increment: 1 } },
      });
      if (order.fulfillmentStatus === "fulfilled") {
        await finalizeOrder(rec.idempotencyKey);
      } else if (order.fulfillmentStatus === "failed") {
        await db.gohubOrder.update({
          where: { id: rec.id },
          data: { status: "FAILED", lastError: "GoHub fulfillment failed" },
        });
      }
      // else still pending — leave it for the next tick
    } catch (e) {
      console.error(
        `[gohub] poll ${rec.gohubOrderCode ?? rec.shopifyOrderName} failed:`,
        (e as Error).message,
      );
    }
  }
}

/**
 * Places the GoHub order for a PENDING row (charges the prepaid wallet) and
 * records its order code. Called from the webhook and from the poller, so it is
 * safe to call more than once: GoHub replays the same Idempotency-Key.
 *
 * GoHub errors are classified and recorded here; any other error propagates to
 * the caller (the webhook turns it into a 500 → Shopify retry; the poller logs
 * it and retries on the next tick).
 */
async function placeGohubOrder(rec: GohubOrder): Promise<void> {
  const items = JSON.parse(rec.items) as OrderItem[];
  if (items.length === 0) {
    await db.gohubOrder.update({
      where: { id: rec.id },
      data: { status: "FAILED", lastError: "no eSIM items recorded" },
    });
    return;
  }

  const gohub = getGoHub();

  // Cheap, non-fatal balance pre-check (the 402 branch below is the real guard).
  try {
    const bal = await gohub.getBalance();
    console.log(
      `[gohub] wallet ${bal.balance} ${bal.currency} before order ${rec.shopifyOrderName}`,
    );
  } catch (e) {
    console.warn("[gohub] balance check skipped:", (e as Error).message);
  }

  try {
    const result = await gohub.createOrder({
      items,
      currency: rec.currency,
      idempotencyKey: rec.idempotencyKey,
      contactEmail: rec.customerEmail || undefined,
    });
    // Persist the order code immediately, on its own, before anything else can
    // throw — otherwise a later failure would strand a charged order with no code.
    await db.gohubOrder.update({
      where: { id: rec.id },
      data: { gohubOrderCode: result.orderCode, lastError: null },
    });
  } catch (e) {
    if (e instanceof GoHubError) {
      if (e.code === "INSUFFICIENT_BALANCE") {
        await db.gohubOrder.update({
          where: { id: rec.id },
          data: { status: "NO_BALANCE", lastError: `${e.code}: ${e.message}` },
        });
        console.error(
          `[gohub] order ${rec.shopifyOrderName} not placed: wallet out of funds (top up the B2B portal).`,
        );
        return;
      }
      if (e.retryable) {
        // Leave PENDING with no code; the poller re-attempts on its next tick.
        await db.gohubOrder.update({
          where: { id: rec.id },
          data: { lastError: `${e.code}: ${e.message}` },
        });
        console.warn(
          `[gohub] order ${rec.shopifyOrderName} placement will retry: ${e.code}`,
        );
        return;
      }
      // Terminal GoHub error (e.g. validation) — stop retrying.
      await db.gohubOrder.update({
        where: { id: rec.id },
        data: { status: "FAILED", lastError: `${e.code}: ${e.message}` },
      });
      console.error(`[gohub] order ${rec.shopifyOrderName} failed: ${e.code}`);
      return;
    }
    // Unexpected (e.g. DB) error — let the caller decide (webhook → 500).
    throw e;
  }
}

/**
 * Collects the fulfilled eSIMs for one order, stores them, emails the customer
 * once, and marks the order FULFILLED. Called only from the serial poller, so
 * it never runs concurrently with itself. Idempotent on ICCID and emailSentAt.
 */
async function finalizeOrder(idempotencyKey: string): Promise<void> {
  const rec = await db.gohubOrder.findUnique({ where: { idempotencyKey } });
  if (!rec || !rec.gohubOrderCode || rec.status === "FULFILLED") return;

  const order = await getGoHub().getOrder(rec.gohubOrderCode);
  if (order.fulfillmentStatus !== "fulfilled") return;

  const emailItems: EsimEmailItem[] = [];
  for (const e of order.esims) {
    const planName = e.itemName ?? e.itemCode ?? "eSIM";
    const existing = await db.provisionedEsim.findUnique({
      where: { iccid: e.iccid },
    });
    if (!existing) {
      await db.provisionedEsim.create({
        data: {
          shop: rec.shop,
          gohubOrderCode: rec.gohubOrderCode,
          iccid: e.iccid,
          lpa: e.lpa,
          qrImageUrl: e.qrImageUrl ?? undefined,
          planName,
          activationExpiresAt: e.activationExpiresAt
            ? new Date(e.activationExpiresAt)
            : undefined,
          expiresAt: e.expiresAt ? new Date(e.expiresAt) : undefined,
          customerEmail: rec.customerEmail,
        },
      });
    }
    emailItems.push({
      planName,
      iccid: e.iccid,
      lpa: e.lpa,
      qrPng: await lpaToQrPng(e.lpa),
    });
  }

  // Email once. Persist emailSentAt in its own write immediately after a
  // successful send, so a crash before the status write never resends.
  if (rec.customerEmail && emailItems.length > 0 && !rec.emailSentAt) {
    await sendEsimEmail({
      to: rec.customerEmail,
      orderName: rec.shopifyOrderName,
      items: emailItems,
    });
    await db.gohubOrder.update({
      where: { idempotencyKey },
      data: { emailSentAt: new Date() },
    });
  }

  await db.gohubOrder.update({
    where: { idempotencyKey },
    data: { status: "FULFILLED" },
  });
}

/** Maps a Shopify order's line items to the GoHub plan codes this shop pushed. */
async function resolveOrderItems(
  shop: string,
  lineItems: OrderLineItem[],
): Promise<OrderItem[]> {
  const variantIds = lineItems
    .map((li) => String(li.variant_id))
    .filter(Boolean);
  const mappings = await db.resellerPlan.findMany({
    where: { shop, shopifyVariantNumericId: { in: variantIds } },
  });
  const byVariant = new Map(
    mappings.map((m) => [m.shopifyVariantNumericId!, m]),
  );

  const items: OrderItem[] = [];
  for (const li of lineItems) {
    const mapping = byVariant.get(String(li.variant_id));
    if (!mapping) continue; // not a GoHub eSIM line item
    items.push({ code: mapping.gohubPlanId, quantity: Math.max(1, li.quantity) });
  }
  return items;
}
