import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`[compliance] ${topic} for ${shop}`);
  // MVP: no stored PII to erase beyond ProvisionedEsim.customerEmail.
  return new Response(null, { status: 200 });
};
