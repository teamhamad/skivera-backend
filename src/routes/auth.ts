import { Router } from "express";

const router = Router();

router.post("/login", (req, res) => {
  const { email, password } = req.body;
  res.json({
    token: "test-token-123",
    user: {
      userId: "user-123",
      email: email,
      name: "Test User"
    }
  });
});

router.post("/register", (req, res) => {
  const { email, password, name } = req.body;
  res.json({
    token: "test-token-123",
    user: {
      userId: "user-123",
      email: email,
      name: name || "New User"
    }
  });
});

export default router;
