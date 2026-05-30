import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botRouter from "./bot";
import settingsRouter from "./settings";
import logsRouter from "./logs";
import messagesRouter from "./messages";
import patternsRouter from "./patterns";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(settingsRouter);
router.use(logsRouter);
router.use(messagesRouter);
router.use(patternsRouter);
router.use(statsRouter);

export default router;
