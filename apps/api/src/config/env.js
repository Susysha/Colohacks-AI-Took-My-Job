import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config({ path: new URL("../../../../.env", import.meta.url) });

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const defaultWhisperModelsDir = path.join(repoRoot, "whisper", "models");

export const env = {
  apiPort: Number(process.env.API_PORT || 5000),
  jwtSecret: process.env.JWT_SECRET || "medirelay-dev-secret",
  publicWebUrl: process.env.PUBLIC_WEB_URL || "http://localhost:5173",
  publicApiUrl: process.env.PUBLIC_API_URL || "http://localhost:5000",
  mongodbUri: process.env.MONGODB_URI || "",
  cloudSttEndpoint: process.env.CLOUD_STT_ENDPOINT || "",
  cloudSttApiKey: process.env.CLOUD_STT_API_KEY || "",
  repoRoot,
  whisperCppMode: process.env.WHISPER_CPP_MODE || "docker",
  whisperCppDockerImage: process.env.WHISPER_CPP_DOCKER_IMAGE || "ghcr.io/ggml-org/whisper.cpp:main",
  whisperCppModelName: process.env.WHISPER_CPP_MODEL_NAME || "base.en",
  whisperCppModelFile: process.env.WHISPER_CPP_MODEL_FILE || "ggml-base.en.bin",
  whisperCppModelsDir: process.env.WHISPER_CPP_MODELS_DIR || defaultWhisperModelsDir,
  whisperCppLanguage: process.env.WHISPER_CPP_LANGUAGE || "en"
};
