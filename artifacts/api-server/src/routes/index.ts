import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botRouter from "./bot";
import settingsRouter from "./settings";
import logsRouter from "./logs";
import messagesRouter from "./messages";
import patternsRouter from "./patterns";
import statsRouter from "./stats";
import streamersRouter from "./streamers";
import schedulerRouter from "./scheduler";
import sessionsRouter from "./sessions";
import learningRouter from "./learning";

const router: IRouter = Router();

router.use(healthRouter);
router.use(botRouter);
router.use(settingsRouter);
router.use(logsRouter);
router.use(messagesRouter);
router.use(patternsRouter);
router.use(statsRouter);
router.use(streamersRouter);
router.use(schedulerRouter);
router.use(sessionsRouter);
router.use(learningRouter);

export default router;
