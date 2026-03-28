import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { env } from "../config/env.js";

function dockerPath(inputPath) {
  return path.resolve(inputPath).replace(/\\/g, "/");
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
    });
  });
}

function sanitizeLanguage(language) {
  if (!language) return env.whisperCppLanguage;
  return String(language).replace(/[^a-z-]/gi, "").slice(0, 12) || env.whisperCppLanguage;
}

async function ensureModelExists() {
  const modelPath = path.join(env.whisperCppModelsDir, env.whisperCppModelFile);

  try {
    await fs.access(modelPath);
  } catch {
    throw new Error(
      `Whisper model not found at ${modelPath}. Run \`npm.cmd run setup:whisper\` before using voice transcription.`
    );
  }

  return modelPath;
}

async function transcribeWithDocker(inputPath, extension, language) {
  const modelPath = await ensureModelExists();
  const tempDir = path.dirname(inputPath);
  const tempMount = `${dockerPath(tempDir)}:/audios`;
  const modelMount = `${dockerPath(path.dirname(modelPath))}:/models`;
  const inputName = path.basename(inputPath);
  const wavName = "input.wav";
  const outputPrefix = "/audios/transcript";
  const dockerImage = env.whisperCppDockerImage;
  const transcriptionInput = extension === ".wav" ? `/audios/${inputName}` : `/audios/${wavName}`;

  if (extension !== ".wav") {
    await runCommand("docker", [
      "run",
      "--rm",
      "-v",
      tempMount,
      "-v",
      modelMount,
      dockerImage,
      `ffmpeg -y -i /audios/${inputName} -ar 16000 -ac 1 -c:a pcm_s16le /audios/${wavName}`
    ]);
  }

  await runCommand("docker", [
    "run",
    "--rm",
    "-v",
    tempMount,
    "-v",
    modelMount,
    dockerImage,
    `whisper-cli -m /models/${env.whisperCppModelFile} -f ${transcriptionInput} -l ${language} -otxt -of ${outputPrefix}`
  ]);

  const outputPath = path.join(tempDir, "transcript.txt");
  const transcript = await fs.readFile(outputPath, "utf8");
  return transcript.trim();
}

export async function transcribeAudio({ audioBase64, fileName = "summary.m4a", language }) {
  if (!audioBase64) {
    throw new Error("Missing audio payload for transcription.");
  }

  const sanitizedLanguage = sanitizeLanguage(language);
  const extension = path.extname(fileName).toLowerCase() || ".m4a";
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "medirelay-whisper-"));
  const inputPath = path.join(tempDir, `${randomUUID()}${extension}`);

  try {
    await fs.writeFile(inputPath, Buffer.from(audioBase64, "base64"));

    if (env.whisperCppMode !== "docker") {
      throw new Error("Only Docker-backed whisper.cpp mode is configured in this project.");
    }

    const transcript = await transcribeWithDocker(inputPath, extension, sanitizedLanguage);
    return {
      transcript,
      source: "whisper.cpp"
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function setupWhisperModel() {
  await fs.mkdir(env.whisperCppModelsDir, { recursive: true });

  await runCommand("docker", [
    "run",
    "--rm",
    "-v",
    `${dockerPath(env.whisperCppModelsDir)}:/models`,
    env.whisperCppDockerImage,
    `./models/download-ggml-model.sh ${env.whisperCppModelName} /models`
  ]);

  const modelPath = path.join(env.whisperCppModelsDir, env.whisperCppModelFile);
  await fs.access(modelPath);
  return modelPath;
}
