import { createHash } from "node:crypto";

// ---------- Types (the contract the real client must also implement) ----------

export interface GoHubPlan {
  planId: string;
  name: string;
  region: string; // display label, e.g. "Vietnam", "Europe (36 countries)"
  coverage: string[]; // ISO country codes, e.g. ["VN"]
  dataAmount: string; // display, e.g. "5 GB" or "Unlimited"
  dataMb: number | null; // null = unlimited
  validityDays: number;
  basePrice: string; // USD, e.g. "4.00"
  currency: string; // "USD"
}

export interface ProvisionResult {
  planId: string;
  iccid: string;
  lpa: string; // "LPA:1$<smdp>$<matchingId>"
  qrPayload: string; // what to encode in the QR (== lpa)
  status: "ASSIGNED";
}

export interface EsimStatus {
  iccid: string;
  status: "ASSIGNED" | "INSTALLED" | "ENABLED" | "EXPIRED";
  usedMb: number;
  totalMb: number | null;
  expiresAt: string; // ISO
}

export interface GoHubClient {
  getPlans(): Promise<GoHubPlan[]>;
  provision(input: {
    planId: string;
    idempotencyKey: string;
  }): Promise<ProvisionResult>;
  getEsim(iccid: string): Promise<EsimStatus>;
}

// ---------- Deterministic fake-id helpers ----------

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
  const body = "8931" + hashDigits(`${seed}:iccid`, 14); // 18 digits before check
  return body + String(luhnCheck(body)); // 19-digit ICCID
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

// ---------- Mock catalog (FULL mock data) ----------

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

// ---------- Mock client ----------

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export class MockGoHubClient implements GoHubClient {
  async getPlans(): Promise<GoHubPlan[]> {
    await delay(150); // simulate network
    return structuredClone(MOCK_PLANS);
  }

  async provision({
    planId,
    idempotencyKey,
  }: {
    planId: string;
    idempotencyKey: string;
  }): Promise<ProvisionResult> {
    await delay(250);
    const plan = MOCK_PLANS.find((p) => p.planId === planId);
    if (!plan) throw new Error(`GoHub(mock): unknown planId "${planId}"`);
    const lpa = makeLpa(idempotencyKey); // deterministic -> retries identical
    return {
      planId,
      iccid: makeIccid(idempotencyKey),
      lpa,
      qrPayload: lpa,
      status: "ASSIGNED",
    };
  }

  async getEsim(iccid: string): Promise<EsimStatus> {
    await delay(100);
    return {
      iccid,
      status: "ASSIGNED",
      usedMb: 0,
      totalMb: 5120,
      expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(),
    };
  }
}

// ---------- Live client (stub - implement when GoHub API is ready) ----------

export class LiveGoHubClient implements GoHubClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}
  async getPlans(): Promise<GoHubPlan[]> {
    // TODO: GET `${this.baseUrl}/plans` with Authorization: Bearer ${this.apiKey}; map response -> GoHubPlan[]
    throw new Error("LiveGoHubClient.getPlans not implemented");
  }
  async provision(_input: {
    planId: string;
    idempotencyKey: string;
  }): Promise<ProvisionResult> {
    // TODO: POST `${this.baseUrl}/esims` { planId, idempotencyKey }; map response -> ProvisionResult
    throw new Error("LiveGoHubClient.provision not implemented");
  }
  async getEsim(_iccid: string): Promise<EsimStatus> {
    // TODO: GET `${this.baseUrl}/esims/${iccid}`
    throw new Error("LiveGoHubClient.getEsim not implemented");
  }
}

// ---------- Factory ----------

let _client: GoHubClient | null = null;
export function getGoHub(): GoHubClient {
  if (_client) return _client;
  if (process.env.GOHUB_MODE === "live") {
    _client = new LiveGoHubClient(
      process.env.GOHUB_BASE_URL!,
      process.env.GOHUB_API_KEY!,
    );
  } else {
    _client = new MockGoHubClient();
  }
  return _client;
}
