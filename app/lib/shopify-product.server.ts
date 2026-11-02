import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { GoHubPlan } from "../gohub.server";

const PRODUCT_SET = `#graphql
  mutation ProductSet($input: ProductSetInput!) {
    productSet(synchronous: true, input: $input) {
      product { id variants(first: 1) { nodes { id } } }
      userErrors { field message }
    }
  }`;

const PUBLICATIONS = `#graphql
  query Publications { publications(first: 20) { nodes { id name } } }`;

const PUBLISH = `#graphql
  mutation Publish($id: ID!, $input: [PublicationInput!]!) {
    publishablePublish(id: $id, input: $input) { userErrors { field message } }
  }`;

export interface PushResult {
  productGid: string;
  variantGid: string;
  variantNumericId: string;
}

export async function pushPlanToStore(
  admin: AdminApiContext,
  plan: GoHubPlan,
  salePrice: string,
  existingProductGid?: string | null,
): Promise<PushResult> {
  const descriptionHtml = `
    <ul>
      <li><strong>Coverage:</strong> ${plan.region}</li>
      <li><strong>Data:</strong> ${plan.dataAmount}</li>
      <li><strong>Validity:</strong> ${plan.validityDays} days</li>
    </ul>
    <p>Digital eSIM - delivered by email after purchase. No physical SIM is shipped.</p>`;

  const input: Record<string, unknown> = {
    ...(existingProductGid ? { id: existingProductGid } : {}),
    title: plan.name,
    descriptionHtml,
    vendor: "GoHub",
    productType: "eSIM",
    status: "ACTIVE",
    tags: ["gohub", "esim", plan.region],
    productOptions: [{ name: "Plan", values: [{ name: plan.name }] }],
    variants: [
      {
        price: salePrice,
        sku: plan.planId,
        optionValues: [{ optionName: "Plan", name: plan.name }],
        inventoryItem: {
          tracked: false,
          requiresShipping: false,
          sku: plan.planId,
        },
      },
    ],
  };

  const res = await admin.graphql(PRODUCT_SET, { variables: { input } });
  const json = await res.json();
  const errs = json.data?.productSet?.userErrors ?? [];
  if (errs.length)
    throw new Error(
      `productSet: ${errs
        .map((e: { field: string[]; message: string }) => `${e.field}: ${e.message}`)
        .join("; ")}`,
    );

  const product = json.data.productSet.product;
  const productGid: string = product.id;
  const variantGid: string = product.variants.nodes[0].id;
  const variantNumericId = variantGid.split("/").pop()!;

  // Best-effort publish to Online Store so it's buyable for testing.
  try {
    const pubRes = await admin.graphql(PUBLICATIONS);
    const pubJson = await pubRes.json();
    const onlineStore = pubJson.data.publications.nodes.find(
      (n: { id: string; name: string }) => n.name === "Online Store",
    );
    if (onlineStore) {
      await admin.graphql(PUBLISH, {
        variables: { id: productGid, input: [{ publicationId: onlineStore.id }] },
      });
    }
  } catch (e) {
    console.warn(
      "publish to Online Store failed (publish manually in admin):",
      e,
    );
  }

  return { productGid, variantGid, variantNumericId };
}
