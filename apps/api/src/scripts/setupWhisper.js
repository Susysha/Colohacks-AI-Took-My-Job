import { setupWhisperModel } from "../services/whisperService.js";

async function main() {
  try {
    const modelPath = await setupWhisperModel();
    console.log(`Whisper model ready at ${modelPath}`);
  } catch (error) {
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

main();
