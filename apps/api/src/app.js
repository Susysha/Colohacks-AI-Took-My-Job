import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { requireAuth } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/error.js";
import { adminRouter } from "./routes/adminRoutes.js";
import { authRouter } from "./routes/authRoutes.js";
import { handleSync, transferRouter } from "./routes/transferRoutes.js";
import { transcribeAudio } from "./services/whisperService.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true
    })
  );
  app.use(express.json({ limit: "15mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      publicWebUrl: env.publicWebUrl
    });
  });

  app.post("/voice/transcribe", async (request, response, next) => {
    const transcriptCandidate = request.body.transcriptCandidate || "";
    const audioBase64 = request.body.audioBase64 || "";
    const fileName = request.body.fileName || "summary.m4a";
    const language = request.body.language;

    if (!audioBase64) {
      response.json({
        transcript: transcriptCandidate.trim(),
        source: transcriptCandidate.trim() ? "manual-fallback" : "empty"
      });
      return;
    }

    try {
      const result = await transcribeAudio({ audioBase64, fileName, language });
      response.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.use("/auth", authRouter);
  app.use("/admin", adminRouter);
  app.post("/sync/batch", requireAuth, ...handleSync);
  app.use("/transfers", transferRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
