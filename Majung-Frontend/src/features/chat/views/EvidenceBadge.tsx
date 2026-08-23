// 답변 말풍선에 붙는 근거 단계 표시 (§6.4).
//
// 확인한 자료인지 인터넷 검색 결과인지가 말투만이 아니라 눈으로도 구분되어야 한다.
//
// **주장을 세게 하지 않는다.** "확인한 자료예요"는 이 답이 그 자료에서 나왔다는 주장이라,
// 붙은 카드가 질문과 어긋나면 그대로 거짓말이 된다. "참고했어요"는 그 자료를 보고
// 답했다는 정도라 어긋나도 거짓이 아니다. 검색 정확도를 올려 풀려던 문제를 문구의
// 강도를 낮춰 푼다 — 맞는 경우를 하나도 잃지 않는다.
//
// **웹 단계 문구는 같이 눅이지 않는다.** 둘을 함께 약하게 하면 두 단계의 대비가 사라지고,
// 확실성이 다르다는 신호가 애초에 배지를 붙이는 이유다 (§6.4).
//
// **배지가 답할 것은 출처가 아니라 "그래서 어떻게 하면 되나"이다.** 출처만 적어 두면
// 사용자는 그것을 읽고도 무엇을 달리해야 하는지 모른다. §6.4가 인터넷 검색 결과에
// "다만 확인이 필요할 수 있어요"를 붙이라고 정한 이유가 그것이며, 여기서는 그것을
// 할 수 있는 행동("전화로 한 번 확인해 보세요")으로 적는다.
import { Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import type { Evidence } from "../domain/chatMessage";

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
        {isRag ? "확인한 자료를 참고했어요" : "인터넷에서 찾은 내용이에요"}
      </Text>
      <Text
        className="mt-1 text-[12.5px] leading-[20px]"
        style={{ color: isRag ? COLORS.noteInfoInk : COLORS.noteWarnInk }}
      >
        {evidence.org}
      </Text>
      {/* **확인 날짜는 여기 없다.** 카드마다 자기 날짜를 갖고 있고, 답변 말풍선 안에
          날짜가 있으면 "답변을 확인했다"로 읽힌다. 날짜는 카드 말풍선에만 붙인다 */}
      {isRag ? null : (
        // §6.4가 정한 "다만 확인이 필요할 수 있어요"를 할 수 있는 행동으로 적는다.
        <Text
          className="mt-1 text-[12.5px] font-bold leading-[20px]"
          style={{ color: COLORS.noteWarnInk }}
        >
          전화로 한 번 확인해 보세요.
        </Text>
      )}
    </View>
  );
}
