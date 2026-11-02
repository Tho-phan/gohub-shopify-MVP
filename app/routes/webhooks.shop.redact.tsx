import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  console.log(`[compliance] ${topic} for ${shop}`);
  // shop/redact: remove this shop's provisioned eSIM records.
  await db.provisionedEsim.deleteMany({ where: { shop } });
  return new Response(null, { status: 200 });
};
