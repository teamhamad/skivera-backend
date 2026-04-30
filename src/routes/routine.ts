import { Router, type IRouter, type Request, type Response } from "express";
import { verifySessionToken } from "../lib/identity";

const router: IRouter = Router();

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

router.post("/generate", (req: Request, res: Response) => {
  const auth = requireAuth(req, res);
  if (!auth) return;

  const profile = req.body?.profile as { issues?: string[]; skinType?: string } | null;
  const issues = profile?.issues ?? [];
  const skinType = profile?.skinType ?? "Balanced";

  const morning = [
    "Cleanse with a gentle, non-stripping face wash.",
    issues.includes("Dark Spots") ? "Apply Vitamin C antioxidant serum." : "Apply hydration serum.",
    "Apply broad-spectrum SPF 50 sunscreen.",
  ];

  const night = [
    "Double cleanse to remove buildup and sunscreen.",
    issues.includes("Acne") ? "Apply salicylic acid to breakout-prone zones." : "Apply recovery serum.",
    "Seal with ceramide-rich moisturizer.",
  ];

  const weekly = [
    skinType === "Dry" ? "Use a nourishing hydration mask twice weekly." : "Use a balancing mask once or twice weekly.",
    "Track irritation level and skip actives if sensitivity increases.",
  ];

  res.json({
    morning,
    night,
    weekly,
    generatedAt: Date.now(),
  });
});

export default router;
