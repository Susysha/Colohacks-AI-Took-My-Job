import { useState } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { transcribeAudio } from "../lib/api";

export function useVoiceSummary({ onTranscript }) {
  const [recording, setRecording] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");

  async function startListening() {
    setError("");

    try {
      const permission = await Audio.requestPermissionsAsync();

      if (!permission.granted) {
        setError("Microphone permission denied.");
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true
      });

      const result = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(result.recording);
      setIsListening(true);
    } catch (_error) {
      setError("Unable to start recording on this device.");
      setIsListening(false);
    }
  }

  async function stopListening() {
    if (!recording) {
      setIsListening(false);
      return;
    }

    setIsListening(false);
    setIsProcessing(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();

      if (!uri) {
        throw new Error("Missing recording file.");
      }

      const audioBase64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64
      });

      const fileName = uri.split("/").pop() || "summary.m4a";
      const result = await transcribeAudio({
        audioBase64,
        fileName,
        language: "en"
      });

      if (!result.transcript) {
        setError("No transcript returned. Try a shorter recording.");
      } else {
        onTranscript(result.transcript);
      }

      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    } catch (_error) {
      setError(_error.message || "Voice transcription failed.");
    } finally {
      setRecording(null);
      setIsProcessing(false);
    }
  }

  return {
    supported: true,
    isListening,
    isProcessing,
    error,
    startListening,
    stopListening
  };
}
