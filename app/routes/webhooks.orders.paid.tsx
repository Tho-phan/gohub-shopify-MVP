import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { provisionOrder } from "../lib/provision.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request); // <- HMAC verified here
  console.log(
    `[webhook] ${topic} for ${shop} order ${(payload as { name?: string })?.name}`,
  );

  try {
    await provisionOrder(shop, payload as never);
  } catch (e) {
    console.error("provisionOrder failed:", e);
    // Return 500 so Shopify retries transient failures; our idempotency keeps retries safe.
    return new Response("provisioning error", { status: 500 });
  }
  return new Response(null, { status: 200 });
};
