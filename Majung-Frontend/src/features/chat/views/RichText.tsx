// 모델이 쓴 마크다운 표시를 화면에 맞게 푼다.
//
// **모델은 `**굵게**`와 `---`를 쓴다.** 프롬프트로 막아도 새어 나오고, 그대로 두면
// 화면에 별표가 그대로 보인다. 저리터러시 사용자에게 `**오금동 주민센터**`는
// 강조가 아니라 읽을 수 없는 기호다.
//
// **여는 것은 굵게와 구분선뿐이다.** 목록·표·링크까지 다루면 마크다운 렌더러가 되고,
// 그러면 모델이 무엇을 내보내든 화면이 따라가야 한다. 실제로 새어 나오는 둘만 푼다.
import { Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

/** `**…**`를 굵은 조각으로 가른다. 짝이 안 맞는 별표는 글자 그대로 둔다. */
function bolded(line: string, keyBase: string): React.ReactNode {
  const parts = line.split(/\*\*(.+?)\*\*/g);
  if (parts.length === 1) return line;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Text key={`${keyBase}-${i}`} className="font-extrabold">
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.split("\n");
  return (
    <View>
      {lines.map((line, i) => {
        const trimmed = line.trim();
        // 구분선은 선으로 그린다. 글자 "---"가 보이면 화면이 망가진 것으로 읽힌다.
        if (/^-{3,}$/.test(trimmed)) {
          return (
            <View
              key={`hr-${i}`}
              className="my-3 h-px"
              style={{ backgroundColor: COLORS.lineStrong }}
            />
          );
        }
        if (trimmed === "") return <View key={`sp-${i}`} className="h-2" />;
        return (
          <Text key={`ln-${i}`} className={className}>
            {bolded(line, `ln-${i}`)}
          </Text>
        );
      })}
    </View>
  );
}
