// 음성 상담 화면 — 큰 마이크 버튼으로 말하면 감정×구체성에 맞춘 응답을 보여준다.
// 저리터러시 전제: 큰 글씨, 한 화면 한 행동, 쉬운 말. props 없이 훅으로 동작.

import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import type { VoiceResult } from "../../../shared/types";
import { useVoiceCapture } from "../hooks/useVoiceCapture";

/** 감정 그룹 → 사람이 읽는 라벨/이모지. 격앙(고각성)과 침울을 구분해 보여준다. */
function emotionLabel(group: string, top: string): { emoji: string; text: string } {
  if (group !== "negative") return { emoji: "🙂", text: "차분한 상태" };
  if (top === "surprised" || top === "angry" || top === "disgusted") {
    return { emoji: "😤", text: "답답하고 급한 마음" };
  }
  return { emoji: "😟", text: "많이 힘든 마음" };
}

function specLabel(spec: string): string {
  return spec === "vague" ? "두루뭉술하게" : "구체적으로";
}

const NEGATIVE_KEYS = ["angry", "disgusted", "fearful", "sad"];

/** 부정 감정 신호를 "disgusted 45%, sad 12%"처럼 요약(0%는 생략). 튜닝 근거 확인용. */
function topNegatives(scores: Record<string, number>): string {
  return NEGATIVE_KEYS.map((k) => ({ k, v: scores[k] ?? 0 }))
    .filter((e) => e.v >= 0.01)
    .sort((a, b) => b.v - a.v)
    .slice(0, 2)
    .map((e) => `${e.k} ${Math.round(e.v * 100)}%`)
    .join(", ");
}

function ResultCard({ r }: { r: VoiceResult }) {
  const emo = emotionLabel(r.emotion.group, r.emotion.top);
  const loc = r.location;
  return (
    <View className="w-full gap-4">
      {/* 내가 한 말 */}
      <View className="rounded-2xl bg-line px-5 py-4">
        <Text className="text-[13px] text-[#7a7a7a]">내가 한 말</Text>
        <Text className="mt-1 text-[17px] leading-7 text-ink">“{r.transcript}”</Text>
      </View>

      {/* 감정 × 말투 (적응 로직 시각화) */}
      <View className="gap-2">
        <View className="flex-row flex-wrap gap-2">
          <View className="rounded-full bg-chip px-4 py-2">
            <Text className="text-[14px] text-chip-ink">
              {emo.emoji} {emo.text}
            </Text>
          </View>
          <View className="rounded-full bg-chip px-4 py-2">
            <Text className="text-[14px] text-chip-ink">💬 {specLabel(r.specificity)} 말했어요</Text>
          </View>
        </View>
        {/* 분석 근거(데모·튜닝용) — 음향 모델이 실제로 낸 라벨·점수 */}
        <Text className="text-[12px] text-[#9a9a9a]">
          음향 분석: {r.emotion.top} {Math.round(r.emotion.score * 100)}% · 격앙도{" "}
          {Math.round((r.emotion.distress ?? 0) * 100)}% · 정책 {r.policy}
          {topNegatives(r.emotion.scores) ? ` · ${topNegatives(r.emotion.scores)}` : ""}
        </Text>
      </View>

      {/* 적응형 응답 */}
      <View className="rounded-2xl bg-brand-soft px-5 py-5">
        <Text className="text-[19px] leading-8 text-ink">{r.response}</Text>
      </View>

      {/* 위치 기반 추천 */}
      {loc && (
        <View className="gap-2 rounded-2xl border border-line px-5 py-4">
          <Text className="text-[13px] text-[#7a7a7a]">가까운 곳 안내</Text>
          <Text className="text-[16px] text-ink">🏛️ {loc.jumin_center_hint}</Text>
          {loc.nearest_koreha && (
            <Text className="text-[16px] text-ink">
              🏠 {loc.nearest_koreha.name}
              {loc.nearest_koreha.distance_km != null
                ? ` · 약 ${loc.nearest_koreha.distance_km}km`
                : ""}
              {loc.nearest_koreha.phone ? `\n☎ ${loc.nearest_koreha.phone}` : ""}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

export function VoiceScreen() {
  const { status, result, error, start, stop, reset } = useVoiceCapture();
  const recording = status === "recording";
  const analyzing = status === "analyzing";

  return (
    <ScrollView
      className="flex-1 bg-white"
      contentContainerClassName="items-center gap-6 px-5 py-8"
    >
      <View className="w-full max-w-[560px] items-center gap-6">
        {/* 안내 */}
        <View className="items-center gap-2">
          <Text className="text-[24px] font-bold text-ink">말로 물어보세요</Text>
          <Text className="text-center text-[15px] leading-6 text-[#7a7a7a]">
            버튼을 누르고 편하게 말하면{"\n"}지금 상황에 맞춰 도와드릴게요.
          </Text>
        </View>

        {/* 마이크 버튼 */}
        <Pressable
          onPress={recording ? stop : start}
          disabled={analyzing}
          className={`size-40 items-center justify-center rounded-full active:opacity-80 disabled:opacity-60 ${
            recording ? "bg-red-500" : "bg-brand"
          }`}
        >
          {analyzing ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Text className="text-[64px]">{recording ? "⏹" : "🎤"}</Text>
          )}
        </Pressable>

        {/* 상태 문구 */}
        <Text className="text-center text-[16px] text-ink">
          {status === "idle" && "마이크를 눌러 시작하세요"}
          {recording && "듣고 있어요… 다 말하면 다시 누르세요"}
          {analyzing && "생각하고 있어요…"}
          {status === "done" && "이렇게 도와드릴 수 있어요"}
          {status === "error" && " "}
        </Text>

        {/* 에러 */}
        {error && (
          <View className="w-full rounded-2xl bg-red-50 px-5 py-4">
            <Text className="text-[15px] leading-6 text-red-700">{error}</Text>
          </View>
        )}

        {/* 결과 */}
        {result && <ResultCard r={result} />}

        {/* 다시 하기 */}
        {(status === "done" || status === "error") && (
          <Pressable
            onPress={reset}
            className="rounded-full border border-line px-6 py-3 active:opacity-70"
          >
            <Text className="text-[15px] text-ink">다시 말하기</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
