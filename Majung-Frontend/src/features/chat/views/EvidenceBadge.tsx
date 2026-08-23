// 답변 말풍선에 붙는 근거 단계 표시 (§6.4).
// 확인된 자료인지 인터넷 검색 결과인지가 말투만이 아니라 눈으로도 구분되어야 한다.
import { Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import { type Evidence, checkedAtSentence } from "../domain/chatMessage";

export function EvidenceBadge({ evidence }: { evidence: Evidence }) {
  const isRag = evidence.stage === "rag";
  return (
    <View
      className="mt-3 rounded-lg border px-3 py-2"
      style={{
        backgroundColor: isRag ? COLORS.noteInfo : COLORS.noteWarn,
        borderColor: isRag ? COLORS.noteInfoLine : COLORS.noteWarnLine,
      }}
    >
      <Text
        className="text-[12.5px] font-extrabold"
        style={{ color: isRag ? COLORS.noteInfoInk : COLORS.noteWarnInk }}
      >
        {isRag ? "확인된 자료예요" : "인터넷에서 찾은 내용이에요"}
      </Text>
      <Text
        className="mt-1 text-[12.5px] leading-[20px]"
        style={{ color: isRag ? COLORS.noteInfoInk : COLORS.noteWarnInk }}
      >
        {evidence.org}
      </Text>
      {isRag && evidence.checkedAt ? (
        <Text className="mt-1 text-[12.5px] leading-[20px] text-note-info-ink">
          {checkedAtSentence(evidence.checkedAt)}
        </Text>
      ) : null}
    </View>
  );
}
