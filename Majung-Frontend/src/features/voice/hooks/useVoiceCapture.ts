// 음성 캡처 훅 (웹 전용: MediaRecorder + Geolocation).
// 녹음 → 현재위치(선택) → SER /analyze 호출 → 적응형 결과.
// 본선 네이티브(Expo Go)는 expo-audio/expo-location으로 별도 구현 예정 — 지금은 웹 경로.

import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";

import { ApiError, postVoiceAnalyze } from "../../../shared/utils/api";
import type { VoiceResult } from "../../../shared/types";

export type CaptureStatus =
  | "idle"
  | "recording"
  | "analyzing"
  | "done"
  | "error";

const MAX_MS = 15_000; // 15초 자동 종료(업로드 과대 방지)

/** MediaRecorder가 지원하는 첫 오디오 mime 선택(Chrome=webm, Safari=mp4). */
function pickMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

/** 현재 위치(브라우저 권한). 실패/거부 시 null로 조용히 진행. */
function getCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
    );
  });
}

export function useVoiceCapture() {
  const [status, setStatus] = useState<CaptureStatus>("idle");
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setResult(null);
    setError(null);
    setStatus("idle");
  }, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setResult(null);
    if (Platform.OS !== "web" || typeof navigator === "undefined" || !navigator.mediaDevices) {
      setError("이 기기 브라우저에서는 음성 입력을 아직 지원하지 않아요.");
      setStatus("error");
      return;
    }
    try {
      // 위치는 병렬로 미리 요청(녹음 끝날 때쯤 준비됨). 거부돼도 진행.
      void getCoords().then((c) => (coordsRef.current = c));

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        void analyze(blob);
      };
      rec.start();
      setStatus("recording");
      timerRef.current = setTimeout(() => stop(), MAX_MS);
    } catch {
      // 🔒 오류에 사용자 오디오/발화 정보 담지 않음
      setError("마이크 권한이 필요해요. 브라우저에서 마이크 사용을 허용해 주세요.");
      setStatus("error");
      cleanup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanup]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      setStatus("analyzing");
      rec.stop(); // → onstop → analyze
    }
  }, []);

  async function analyze(blob: Blob) {
    try {
      const r = await postVoiceAnalyze(blob, coordsRef.current);
      setResult(r);
      setStatus("done");
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : "지금 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.";
      setError(msg);
      setStatus("error");
    } finally {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  return { status, result, error, start, stop, reset };
}
