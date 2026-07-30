import { VoiceScreen } from "@/features/voice";

// 음성 상담(베타) — 음성→감정·구체성→적응형 RAG. 구현은 features/voice.
// (tabs) 밖 독립 라우트: 폰 테스트는 /voice 로 바로 접근 가능.
export default function VoiceRoute() {
  return <VoiceScreen />;
}
