import { Router, type IRouter, type Request, type Response } from "express";
import { hashPassword, signSessionToken, verifyPassword } from "../lib/identity";
import { mockDb } from "../lib/mockDb";

const router: IRouter = Router();

router.post("/register", (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const name = String(req.body?.name ?? email.split("@")[0] ?? "Operator").trim();

  if (!email || !password || password.length < 8) {
    res.status(400).json({ error: "Valid email and password(>=8 chars) required" });
    return;
  }

  const user = mockDb.createUser({
    email,
    passwordHash: hashPassword(password),
    name,
  });
  if (!user) {
    res.status(409).json({ error: "Email already registered" });
    return;
  }

  const token = signSessionToken({ userId: user.userId, email: user.email, name: user.name });
  res.json({
    token,
    user: {
      userId: user.userId,
      email: user.email,
      name: user.name,
    },
  });
});

router.post("/login", (req: Request, res: Response) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const user = mockDb.getUserByEmail(email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signSessionToken({ userId: user.userId, email: user.email, name: user.name });
  res.json({
    token,
    user: {
      userId: user.userId,
      email: user.email,
      name: user.name,
    },
  });
});

export default router;

