import { createHash } from "node:crypto";

// ---------- Catalog type (for the reseller UI; maps from GoHub GET /products) ----------

export interface GoHubPlan {
  planId: string; // GoHub product `code` (what you order with)
  name: string;
  region: string;
  coverage: string[]; // ISO country codes
  dataAmount: string; // "5 GB" | "Unlimited"
  dataMb: number | null; // null = unlimited
  validityDays: number;
  basePrice: string; // finalUnitPrice, decimal string
  currency: string; // "USD" | "VND"
}

// ---------- Order / provisioning types (GoHub POST /orders + GET /orders/{code}) ----------

export type FulfillmentStatus = "pending" | "fulfilled" | "failed";

export interface GoHubOrderEsim {
  iccid: string;
  lpa: string;
  qrImageUrl: string | null;
  expiresAt: string | null;
  activationExpiresAt: string | null;
  itemCode: string | null;
  itemName: string | null;
}

export interface GoHubOrder {
  orderCode: string;
  fulfillmentStatus: FulfillmentStatus;
  currency: string;
  total: string;
  esims: GoHubOrderEsim[];
}

export interface GoHubBalance {
  balance: string;
  currency: string;
}

export interface CreateOrderInput {
  items: { code: string; quantity: number }[];
  currency: string;
  idempotencyKey: string; // unique per logical order (we use the Shopify order id)
  contactEmail?: string;
  expectedTotal?: string;
}

export interface GoHubClient {
  getPlans(): Promise<GoHubPlan[]>;
  getBalance(): Promise<GoHubBalance>;
  createOrder(input: CreateOrderInput): Promise<GoHubOrder>;
  getOrder(orderCode: string): Promise<GoHubOrder>;
}

/** Typed error carrying GoHub's machine-readable error.code (branch on this, never the message). */
export class GoHubError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus?: number,
    public details?: unknown,
  ) {
    super(message);
    this.name = "GoHubError";
  }
  /**
   * Transient errors worth retrying. A network/timeout failure has no
   * httpStatus (the request never got an HTTP response) — treat that as
   * transient too. Defined 4xx (e.g. PRODUCT_NOT_FOUND) stay non-retryable.
   */
  get retryable(): boolean {
    return (
      this.httpStatus == null ||
      this.httpStatus >= 500 ||
      ["UPSTREAM_UNAVAILABLE", "INTERNAL_ERROR", "IDEMPOTENCY_CONFLICT"].includes(
        this.code,
      )
    );
  }
}

// ---------- Deterministic fake-id helpers (mock only) ----------

function hashDigits(seed: string, len: number): string {
  let out = "";
  let i = 0;
  while (out.length < len) {
    const h = createHash("sha256").update(`${seed}:${i++}`).digest("hex");
    for (const ch of h) {
      out += String(parseInt(ch, 16) % 10);
      if (out.length >= len) break;
    }
  }
  return out.slice(0, len);
}

function luhnCheck(numStr: string): number {
  const rev = numStr.split("").reverse();
  let sum = 0;
  rev.forEach((c, i) => {
    let d = parseInt(c, 10);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  });
  return (10 - (sum % 10)) % 10;
}

function makeIccid(seed: string): string {
  const body = "8931" + hashDigits(`${seed}:iccid`, 14);
  return body + String(luhnCheck(body));
}

function makeMatchingId(seed: string, len = 16): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const h = createHash("sha256").update(`${seed}:mid`).digest();
  let out = "";
  for (let i = 0; out.length < len; i++) out += alphabet[h[i % h.length] % 32];
  return out.slice(0, len);
}

function makeLpa(seed: string): string {
  return `LPA:1$rsp.gohub-mock.com$${makeMatchingId(seed)}`;
}

// ---------- Mock catalog ----------

const MOCK_PLANS: GoHubPlan[] = [
  { planId: "vn-5gb-7d", name: "Vietnam 5GB / 7 days", region: "Vietnam", coverage: ["VN"], dataAmount: "5 GB", dataMb: 5120, validityDays: 7, basePrice: "4.00", currency: "USD" },
  { planId: "vn-10gb-15d", name: "Vietnam 10GB / 15 days", region: "Vietnam", coverage: ["VN"], dataAmount: "10 GB", dataMb: 10240, validityDays: 15, basePrice: "7.00", currency: "USD" },
  { planId: "jp-3gb-8d", name: "Japan 3GB / 8 days", region: "Japan", coverage: ["JP"], dataAmount: "3 GB", dataMb: 3072, validityDays: 8, basePrice: "6.00", currency: "USD" },
  { planId: "jp-unltd-7d", name: "Japan Unlimited / 7 days", region: "Japan", coverage: ["JP"], dataAmount: "Unlimited", dataMb: null, validityDays: 7, basePrice: "15.00", currency: "USD" },
  { planId: "kr-5gb-10d", name: "South Korea 5GB / 10 days", region: "South Korea", coverage: ["KR"], dataAmount: "5 GB", dataMb: 5120, validityDays: 10, basePrice: "8.00", currency: "USD" },
  { planId: "th-8gb-15d", name: "Thailand 8GB / 15 days", region: "Thailand", coverage: ["TH"], dataAmount: "8 GB", dataMb: 8192, validityDays: 15, basePrice: "7.50", currency: "USD" },
  { planId: "us-10gb-15d", name: "USA 10GB / 15 days", region: "United States", coverage: ["US"], dataAmount: "10 GB", dataMb: 10240, validityDays: 15, basePrice: "12.00", currency: "USD" },
  { planId: "sea-6gb-15d", name: "Southeast Asia 6GB / 15 days", region: "Southeast Asia (7 countries)", coverage: ["VN", "TH", "KH", "LA", "MY", "SG", "ID"], dataAmount: "6 GB", dataMb: 6144, validityDays: 15, basePrice: "9.00", currency: "USD" },
  { planId: "eu-10gb-30d", name: "Europe 10GB / 30 days", region: "Europe (36 countries)", coverage: ["FR", "DE", "ES", "IT", "NL", "PT"], dataAmount: "10 GB", dataMb: 10240, validityDays: 30, basePrice: "14.00", currency: "USD" },
  { planId: "global-5gb-30d", name: "Global 5GB / 30 days", region: "Global (120+ countries)", coverage: ["GLOBAL"], dataAmount: "5 GB", dataMb: 5120, validityDays: 30, basePrice: "29.00", currency: "USD" },
];

// ---------- Mock client (simulates the async order → poll flow) ----------

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface MockOrderRecord {
  items: { code: string; quantity: number }[];
  currency: string;
}

// Persist across HMR reloads so a PENDING order survives until the poller fulfils it.
const mockOrders: Map<string, MockOrderRecord> = ((
  globalThis as unknown as { __gohubMockOrders?: Map<string, MockOrderRecord> }
).__gohubMockOrders ??= new Map());

export class MockGoHubClient implements GoHubClient {
  async getPlans(): Promise<GoHubPlan[]> {
    await delay(150);
    return structuredClone(MOCK_PLANS);
  }

  async getBalance(): Promise<GoHubBalance> {
    await delay(50);
    return { balance: "1000.00", currency: "USD" };
  }

  async createOrder(input: CreateOrderInput): Promise<GoHubOrder> {
    await delay(200);
    for (const it of input.items) {
      if (!MOCK_PLANS.some((p) => p.planId === it.code)) {
        throw new GoHubError("PRODUCT_NOT_FOUND", `unknown code "${it.code}"`, 400);
      }
    }
    const orderCode = "MOCK" + hashDigits(input.idempotencyKey, 12);
    mockOrders.set(orderCode, { items: input.items, currency: input.currency });
    // Return pending, like production: provisioning is async, esims arrive on poll.
    return {
      orderCode,
      fulfillmentStatus: "pending",
      currency: input.currency,
      total: "0.00",
      esims: [],
    };
  }

  async getOrder(orderCode: string): Promise<GoHubOrder> {
    await delay(100);
    const rec = mockOrders.get(orderCode);
    if (!rec) {
      // Unknown (e.g. map lost to a cold restart): report pending rather than crash.
      return { orderCode, fulfillmentStatus: "pending", currency: "USD", total: "0.00", esims: [] };
    }
    const esims: GoHubOrderEsim[] = [];
    for (const it of rec.items) {
      const plan = MOCK_PLANS.find((p) => p.planId === it.code);
      for (let i = 0; i < it.quantity; i++) {
        const seed = `${orderCode}:${it.code}:${i}`;
        esims.push({
          iccid: makeIccid(seed),
          lpa: makeLpa(seed),
          qrImageUrl: null,
          expiresAt: new Date(Date.now() + 30 * 864e5).toISOString(),
          activationExpiresAt: new Date(Date.now() + 90 * 864e5).toISOString(),
          itemCode: it.code,
          itemName: plan?.name ?? it.code,
        });
      }
    }
    return { orderCode, fulfillmentStatus: "fulfilled", currency: rec.currency, total: "0.00", esims };
  }
}

// ---------- Live client (GoHub Partner API v1) ----------

interface ProductRow {
  code: string;
  name: string;
  coverage?: { countryCode?: string | null; countryName?: string | null; region?: string | null };
  data?: { allowanceGb?: number | null; unlimited?: boolean };
  validity?: { days?: number };
  price?: { currency?: string; finalUnitPrice?: string; unitPrice?: string };
}

export class LiveGoHubClient implements GoHubClient {
  private readonly base: string;
  constructor(baseUrl: string, private apiKey: string) {
    // All paths are relative to <base>/partner/v1
    this.base = `${baseUrl.replace(/\/+$/, "")}/partner/v1`;
  }

  private async request<T>(
    path: string,
    init?: RequestInit & { idempotencyKey?: string },
  ): Promise<T> {
    const headers: Record<string, string> = {
      "X-Partner-Key": this.apiKey,
      Accept: "application/json",
    };
    if (init?.body) headers["Content-Type"] = "application/json";
    if (init?.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, { ...init, headers });
    } catch (e) {
      throw new GoHubError("NETWORK_ERROR", (e as Error).message, undefined);
    }
    const json = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: T;
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (!res.ok || json.success === false) {
      const code = json.error?.code ?? `HTTP_${res.status}`;
      throw new GoHubError(code, json.error?.message ?? code, res.status, json.error?.details);
    }
    return json.data as T;
  }

  async getPlans(): Promise<GoHubPlan[]> {
    const plans: GoHubPlan[] = [];
    // Page until an empty result (docs: don't trust pagination.total).
    for (let page = 1; page <= 50; page++) {
      const rows = await this.request<ProductRow[]>(
        `/products?type=esim&limit=100&page=${page}`,
      );
      if (!rows || rows.length === 0) break;
      for (const r of rows) {
        const unlimited = r.data?.unlimited === true;
        const gb = r.data?.allowanceGb ?? null;
        plans.push({
          planId: r.code,
          name: r.name,
          region: r.coverage?.region ?? r.coverage?.countryName ?? "",
          coverage: r.coverage?.countryCode ? [r.coverage.countryCode] : [],
          dataAmount: unlimited ? "Unlimited" : gb != null ? `${gb} GB` : "",
          dataMb: unlimited || gb == null ? null : Math.round(gb * 1024),
          validityDays: r.validity?.days ?? 0,
          basePrice: r.price?.finalUnitPrice ?? r.price?.unitPrice ?? "0.00",
          currency: r.price?.currency ?? "USD",
        });
      }
      if (rows.length < 100) break;
    }
    return plans;
  }

  async getBalance(): Promise<GoHubBalance> {
    const data = await this.request<{ balance: string; currency: string }>("/balance");
    return { balance: data.balance, currency: data.currency };
  }

  async createOrder(input: CreateOrderInput): Promise<GoHubOrder> {
    const body: Record<string, unknown> = {
      items: input.items,
      currency: input.currency,
    };
    if (input.expectedTotal) body.expectedTotal = input.expectedTotal;
    if (input.contactEmail) body.contact = { email: input.contactEmail, sendEmail: false };
    const data = await this.request<RawOrder>("/orders", {
      method: "POST",
      body: JSON.stringify(body),
      idempotencyKey: input.idempotencyKey,
    });
    return mapOrder(data);
  }

  async getOrder(orderCode: string): Promise<GoHubOrder> {
    const data = await this.request<RawOrder>(`/orders/${encodeURIComponent(orderCode)}`);
    return mapOrder(data);
  }
}

interface RawOrder {
  orderCode: string;
  fulfillmentStatus?: string;
  currency?: string;
  amounts?: { total?: string };
  esims?: Array<{
    iccid: string;
    lpa: string;
    qrImageUrl?: string | null;
    expiresAt?: string | null;
    activationExpiresAt?: string | null;
    item?: { code?: string | null; name?: string | null } | null;
  }>;
}

function mapOrder(o: RawOrder): GoHubOrder {
  const fs = o.fulfillmentStatus;
  const fulfillmentStatus: FulfillmentStatus =
    fs === "fulfilled" ? "fulfilled" : fs === "failed" ? "failed" : "pending";
  return {
    orderCode: o.orderCode,
    fulfillmentStatus,
    currency: o.currency ?? "USD",
    total: o.amounts?.total ?? "0.00",
    esims: (o.esims ?? []).map((e) => ({
      iccid: e.iccid,
      lpa: e.lpa,
      qrImageUrl: e.qrImageUrl ?? null,
      expiresAt: e.expiresAt ?? null,
      activationExpiresAt: e.activationExpiresAt ?? null,
      itemCode: e.item?.code ?? null,
      itemName: e.item?.name ?? null,
    })),
  };
}

// ---------- Factory ----------

let _client: GoHubClient | null = null;
export function getGoHub(): GoHubClient {
  if (_client) return _client;
  if (process.env.GOHUB_MODE === "live") {
    const baseUrl = process.env.GOHUB_BASE_URL;
    const apiKey = process.env.GOHUB_API_KEY;
    if (!baseUrl) throw new Error("GOHUB_MODE=live requires GOHUB_BASE_URL");
    if (!apiKey) throw new Error("GOHUB_MODE=live requires GOHUB_API_KEY");
    _client = new LiveGoHubClient(baseUrl, apiKey);
  } else {
    _client = new MockGoHubClient();
  }
  return _client;
}
