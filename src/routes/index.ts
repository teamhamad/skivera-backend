import { Router, type IRouter } from "express";
import authRouter from "./auth";
import healthRouter from "./health";
import neuralRouter from "./neural";
import ocrRouter from "./ocr";
import routineRouter from "./routine";
import scanRouter from "./scan";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/ocr", ocrRouter);
router.use("/neural", neuralRouter);
router.use("/scan", scanRouter);
router.use("/routine", routineRouter);

export default router;
