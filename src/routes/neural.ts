import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { mockDb } from "../lib/mockDb";
import { verifySessionToken } from "../lib/identity";

type SkinType = "Oily" | "Combination" | "Dry" | "Sensitive" | "Balanced";
type NeuralIssue = "Acne" | "Dark Spots" | "Hyperpigmentation" | "Dryness" | "Congestion";

type NeuralProfile = {
  id: string;
  createdAt: number;
  score: number;
  skinType: SkinType;
  issues: NeuralIssue[];
  zoneFindings: string[];
};

type ProductAnalysis = {
  id: string;
  name: string;
  barcode: string;
  authenticity: "VERIFIED" | "COUNTERFEIT";
  ingredients: string[];
  safetyMatch: "Safe" | "Caution";
  safetyMessage: string;
  ingredientBreakdown: string[];
  usageProtocol: string[];
  analyzedAt: number;
};

const router: IRouter = Router();
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const SIGNING_SECRET = process.env["SKIREVA_API_SIGNING_SECRET"] ?? "";

function buildSignature(payload: unknown, timestamp: number, secret: string): string {
  const base = secret
    ? `${timestamp}:${JSON.stringify(payload)}:${secret}`
    : `${timestamp}:${JSON.stringify(payload)}`;
  let hash = 2166136261;
  for (let i = 0; i < base.length; i += 1) {
    hash ^= base.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `sig-${Math.abs(hash >>> 0)}`;
}

function verifySignedRequest(req: Request, res: Response): boolean {
  const timestampHeader = req.header("x-skireva-timestamp");
  const signatureHeader = req.header("x-skireva-signature");
  if (!timestampHeader || !signatureHeader) {
    res.status(401).json({ error: "Missing request signature headers" });
    return false;
  }
  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    res.status(401).json({ error: "Invalid signature timestamp" });
    return false;
  }
  const skew = Math.abs(Date.now() - timestamp);
  if (skew > MAX_CLOCK_SKEW_MS) {
    res.status(401).json({ error: "Expired request signature timestamp" });
    return false;
  }

  const expected = buildSignature(req.body ?? {}, timestamp, SIGNING_SECRET);
  if (expected !== signatureHeader) {
    logger.warn({ route: req.path, skewMs: skew }, "Neural API signature mismatch");
    res.status(401).json({ error: "Invalid request signature" });
    return false;
  }
  return true;
}

function requireAuth(req: Request, res: Response): { userId: string; email: string; name: string } | null {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  const auth = verifySessionToken(token);
  if (!auth) {
    res.status(401).json({ error: "Invalid bearer token" });
    return null;
  }
  return auth;
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return Math.abs(hash >>> 0);
}

function seededFloat(seed: number, salt: number) {
  const x = Math.sin(seed * 0.001 + salt * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

router.post("/profile", (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  if (!verifySignedRequest(req, res)) return;
  const scanSessionId = String(req.body?.scanSessionId ?? "session");
  const progressHistory = Array.isArray(req.body?.progressHistory)
    ? (req.body.progressHistory as number[])
    : [];

  const seed = hashSeed(`${scanSessionId}:${progressHistory.join(",")}`);
  const score = Math.round(58 + seededFloat(seed, 1) * 38);
  const drynessSignal = (1 - score / 100) * 0.55 + seededFloat(seed, 2) * 0.45;
  const oilSignal = (100 - score) / 180 + seededFloat(seed, 3) * 0.5;

  const skinType: SkinType =
    drynessSignal > 0.7
      ? "Dry"
      : oilSignal > 0.72
        ? "Oily"
        : score < 65
          ? "Sensitive"
          : oilSignal > 0.52 && drynessSignal > 0.52
            ? "Combination"
            : "Balanced";

  const issuesPool: NeuralIssue[] = ["Acne", "Dark Spots", "Hyperpigmentation", "Dryness", "Congestion"];
  const issues = issuesPool.filter((_, idx) => seededFloat(seed, idx + 10) > 0.44);
  if (!issues.length) issues.push("Congestion");
  if (skinType === "Dry" && !issues.includes("Dryness")) issues.push("Dryness");
  if (skinType === "Oily" && !issues.includes("Acne")) issues.push("Acne");

  const zoneFindings: string[] = [];
  if (issues.includes("Acne")) zoneFindings.push("High congestion detected in T-Zone");
  if (issues.includes("Dark Spots") || issues.includes("Hyperpigmentation")) zoneFindings.push("Dark spots detected on left cheek");
  if (issues.includes("Dryness")) zoneFindings.push("Moisture deficit detected on forehead");
  if (zoneFindings.length === 0) zoneFindings.push("Sebum distribution imbalance detected across cheeks");

  const profile: NeuralProfile = {
    id: `np-${seed}-${Date.now()}`,
    createdAt: Date.now(),
    score,
    skinType,
    issues: Array.from(new Set(issues)).slice(0, 4),
    zoneFindings,
  };
  req.log?.info(
    {
      route: "/neural/profile",
      scanSessionId,
      score: profile.score,
      skinType: profile.skinType,
      issuesCount: profile.issues.length,
    },
    "Neural profile generated",
  );
  mockDb.saveNeuralProfile(auth.userId, profile);
  res.json(profile);
});

router.post("/analyze-product", (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  if (!verifySignedRequest(req, res)) return;
  const profile = req.body?.profile as NeuralProfile | null;
  const scanEntropy = String(req.body?.scanEntropy ?? `${Date.now()}|anon|scan-channel`);
  const seed = hashSeed(`${scanEntropy}:${profile?.id ?? "anon"}`);

  const products: Array<{
    name: string;
    barcode: string;
    ingredients: string[];
    authenticityRisk: number;
  }> = [
    {
      name: "Dermaclear Serum",
      barcode: "8901122334455",
      ingredients: ["Water", "Niacinamide", "Ascorbic Acid", "Panthenol", "Fragrance"],
      authenticityRisk: 0.14,
    },
    {
      name: "HydraBarrier Gel",
      barcode: "8909988776655",
      ingredients: ["Water", "Glycerin", "Ceramide NP", "Squalane", "Allantoin"],
      authenticityRisk: 0.08,
    },
    {
      name: "Pore Reset Lotion",
      barcode: "8905544332211",
      ingredients: ["Water", "Salicylic Acid", "Zinc PCA", "Mineral Oil", "Parfum"],
      authenticityRisk: 0.27,
    },
    {
      name: "Radiance C Fluid",
      barcode: "8904433221100",
      ingredients: ["Water", "Ascorbic Acid", "Ferulic Acid", "Vitamin E", "Propanediol"],
      authenticityRisk: 0.11,
    },
  ];

  const product = products[seed % products.length];
  const authenticity = seededFloat(seed, 41) > product.authenticityRisk ? "VERIFIED" : "COUNTERFEIT";

  const lower = product.ingredients.map((x) => x.toLowerCase());
  let penalty = 0;
  if (lower.some((x) => x.includes("fragrance") || x.includes("parfum"))) penalty += 12;
  if (lower.some((x) => x.includes("paraben"))) penalty += 16;
  if (lower.some((x) => x.includes("mineral oil"))) penalty += 15;
  if (profile?.issues.includes("Acne") && lower.some((x) => x.includes("mineral oil"))) penalty += 22;
  if (profile?.issues.includes("Dark Spots") && !lower.some((x) => x.includes("ascorbic") || x.includes("niacinamide"))) penalty += 6;

  const safetyScore = Math.max(0, 100 - penalty);
  const safetyMatch: ProductAnalysis["safetyMatch"] = safetyScore >= 72 ? "Safe" : "Caution";

  const report: ProductAnalysis = {
    id: `report-${seed}-${Date.now()}`,
    name: product.name,
    barcode: product.barcode,
    authenticity,
    ingredients: [...product.ingredients],
    safetyMatch,
    safetyMessage:
      safetyMatch === "Safe"
        ? "SAFE ✅: Ingredient profile aligns with your neural skin map."
        : profile?.issues.includes("Acne")
          ? "HAZARD ⚠: Contains comedogenic triggers likely to aggravate detected acne zones."
          : "CAUTION ⚠: Formula includes irritation-prone compounds for your current profile.",
    ingredientBreakdown: [
      product.ingredients.includes("Niacinamide")
        ? "Niacinamide: supports sebum balance and barrier resilience."
        : "No niacinamide detected: consider pairing with balancing serum.",
      product.ingredients.some((x) => x.toLowerCase().includes("ascorbic"))
        ? "Ascorbic Acid: helps target dark spots and oxidative stress."
        : "Missing antioxidant core: add a separate Vitamin C step if treating pigmentation.",
      product.ingredients.some((x) => x.toLowerCase().includes("fragrance"))
        ? "Fragrance present: possible irritation signal for sensitive profiles."
        : "Fragrance-free profile: lower irritation probability.",
    ],
    usageProtocol: [
      "AM/PM patch test on jawline for 24 hours before first full use.",
      "Use 1-2 pumps on clean, dry skin; avoid direct eye area.",
      profile?.issues.includes("Acne")
        ? "For acne-prone zones, apply on T-Zone only for first week."
        : "Layer with moisturizer to stabilize hydration response.",
    ],
    analyzedAt: Date.now(),
  };
  req.log?.info(
    {
      route: "/neural/analyze-product",
      product: report.name,
      authenticity: report.authenticity,
      safetyMatch: report.safetyMatch,
      issuesCount: profile?.issues.length ?? 0,
    },
    "Neural product analysis generated",
  );
  res.json(report);
});

router.get("/vault/:userId", (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const items = mockDb.listVault(auth.userId);
  res.json({ items });
});

router.get("/vault/self", (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  const items = mockDb.listVault(auth.userId);
  res.json({ items });
});

router.post("/vault/save", (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;
  if (!verifySignedRequest(req, res)) return;
  const item = req.body?.item;
  if (!item?.id) {
    res.status(400).json({ error: "item.id is required" });
    return;
  }
  const items = mockDb.saveVaultItem(auth.userId, item);
  res.json({ items });
});

export default router;
