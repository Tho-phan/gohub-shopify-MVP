import { useCallback, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { getGoHub } from "../gohub.server";
import { pushPlanToStore } from "../lib/shopify-product.server";

function suggestPrice(base: string): string {
  // default suggestion: base + 60% markup, rounded to .99
  const marked = Number(base) * 1.6;
  return (Math.ceil(marked) - 0.01).toFixed(2);
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const plans = await getGoHub().getPlans();
  const saved = await db.resellerPlan.findMany({
    where: { shop: session.shop },
  });
  const savedByPlan = new Map(saved.map((s) => [s.gohubPlanId, s]));

  const rows = plans.map((p) => {
    const s = savedByPlan.get(p.planId);
    return {
      planId: p.planId,
      name: p.name,
      region: p.region,
      dataAmount: p.dataAmount,
      validityDays: p.validityDays,
      basePrice: p.basePrice,
      salePrice: s?.salePrice ?? suggestPrice(p.basePrice),
      pushed: Boolean(s?.shopifyProductGid),
    };
  });
  return { rows };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const gohubPlanId = String(form.get("gohubPlanId"));
  const salePrice = String(form.get("salePrice"));

  if (!/^\d+(\.\d{1,2})?$/.test(salePrice)) {
    return { ok: false, gohubPlanId, error: "Enter a valid price (e.g. 9.00)." };
  }

  const existing = await db.resellerPlan.findUnique({
    where: { shop_gohubPlanId: { shop: session.shop, gohubPlanId } },
  });

  if (intent === "save") {
    await db.resellerPlan.upsert({
      where: { shop_gohubPlanId: { shop: session.shop, gohubPlanId } },
      update: { salePrice },
      create: { shop: session.shop, gohubPlanId, salePrice },
    });
    return { ok: true, gohubPlanId, message: "Price saved." };
  }

  if (intent === "push") {
    const plan = (await getGoHub().getPlans()).find(
      (p) => p.planId === gohubPlanId,
    );
    if (!plan) return { ok: false, gohubPlanId, error: "Unknown plan." };

    const result = await pushPlanToStore(
      admin,
      plan,
      salePrice,
      existing?.shopifyProductGid ?? null,
    );

    await db.resellerPlan.upsert({
      where: { shop_gohubPlanId: { shop: session.shop, gohubPlanId } },
      update: {
        salePrice,
        shopifyProductGid: result.productGid,
        shopifyVariantGid: result.variantGid,
        shopifyVariantNumericId: result.variantNumericId,
        pushedAt: new Date(),
      },
      create: {
        shop: session.shop,
        gohubPlanId,
        salePrice,
        shopifyProductGid: result.productGid,
        shopifyVariantGid: result.variantGid,
        shopifyVariantNumericId: result.variantNumericId,
        pushedAt: new Date(),
      },
    });
    return { ok: true, gohubPlanId, message: "Pushed to store & published." };
  }

  return { ok: false, error: "Unknown intent." };
};

type Row = {
  planId: string;
  name: string;
  region: string;
  dataAmount: string;
  validityDays: number;
  basePrice: string;
  salePrice: string;
  pushed: boolean;
};

export default function Index() {
  const { rows } = useLoaderData<typeof loader>();
  return (
    <s-page heading="GoHub eSIM catalog">
      <s-section heading="Set your selling price and push plans to your store">
        <s-stack direction="block" gap="base">
          {rows.map((r) => (
            <PlanRow key={r.planId} row={r} />
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

function PlanRow({ row }: { row: Row }) {
  const fetcher = useFetcher<typeof action>();
  const [price, setPrice] = useState(row.salePrice);
  const busy = fetcher.state !== "idle";

  const profit = (Number(price) - Number(row.basePrice)).toFixed(2);
  const belowBase = Number(price) < Number(row.basePrice);
  const result = fetcher.data;

  // Bind the Polaris web-component text field's value via a ref listener
  // (reliable for custom elements; cleanup returned from the React 19 ref callback).
  const priceRef = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const handler = (e: Event) =>
      setPrice((e.target as HTMLInputElement).value ?? "");
    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
    return () => {
      el.removeEventListener("input", handler);
      el.removeEventListener("change", handler);
    };
  }, []);

  const submit = (intent: "save" | "push") =>
    fetcher.submit(
      { intent, gohubPlanId: row.planId, salePrice: price },
      { method: "POST" },
    );

  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="small-200">
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-text fontWeight="bold">{row.name}</s-text>
          {row.pushed ? (
            <s-badge tone="success">Pushed</s-badge>
          ) : (
            <s-badge>Not pushed</s-badge>
          )}
        </s-stack>

        <s-text tone="neutral">
          {row.region} · {row.dataAmount} · {row.validityDays}d · base $
          {row.basePrice}
        </s-text>

        <s-stack direction="inline" gap="base" alignItems="end">
          <s-text-field
            ref={priceRef}
            label="Your price"
            value={price}
            prefix="$"
            disabled={busy || undefined}
          />
          <s-text tone={belowBase ? "critical" : "neutral"}>
            {belowBase ? "below base!" : `profit $${profit}`}
          </s-text>
          <s-button onClick={() => submit("save")} disabled={busy || undefined}>
            Save
          </s-button>
          <s-button
            variant="primary"
            onClick={() => submit("push")}
            {...(busy ? { loading: true } : {})}
          >
            {row.pushed ? "Update" : "Push"}
          </s-button>
        </s-stack>

        {result && "gohubPlanId" in result && result.gohubPlanId === row.planId && result.error && (
          <s-banner tone="critical">{result.error}</s-banner>
        )}
        {result && "gohubPlanId" in result && result.gohubPlanId === row.planId && result.ok && (
          <s-banner tone="success">{result.message}</s-banner>
        )}
      </s-stack>
    </s-box>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
