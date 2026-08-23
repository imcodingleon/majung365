// 덮어씌우는 화면의 머리. 제목과 나가는 길만 있다.
//
// 세 화면(내 정보·도움 연결·가까운 곳 찾기)이 **글자 하나 다르지 않은 같은 코드를**
// 각자 들고 있었다. 한 곳을 고치면 나머지가 어긋나므로 한 자리로 모은다.
//
// **닫기를 왼쪽에 둔다.** 오른쪽 위는 엄지가 닿기 먼 자리라, 덮어씌운 화면에서
// 나가는 길을 거기 두면 갇힌 느낌을 준다. 채팅 팝업도 같은 이유로 왼쪽이다.
import { Pressable, Text, View } from "react-native";

type Props = {
  title: string;
  /** 제목 위에 붙는 작은 줄. 어디에서 온 화면인지 알릴 때 쓴다. */
  eyebrow?: string;
  onClose: () => void;
  /** 화면 낭독기가 읽을 문장. 그냥 "닫기"로는 무엇이 닫히는지 모른다. */
  closeHint?: string;
  /** 오른쪽에 놓을 것. 없으면 자리를 만들지 않는다. */
  right?: React.ReactNode;
};

export function ScreenHeader({ title, eyebrow, onClose, closeHint, right }: Props) {
  return (
    <View className="flex-row items-center gap-2 border-b border-line bg-white px-3 py-3">
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeHint ?? `${title} 닫기`}
        className="size-10 items-center justify-center rounded-full active:opacity-70"
      >
        <Text className="text-2xl text-ink-muted">✕</Text>
      </Pressable>

      <View className="flex-1 px-1">
        {eyebrow ? <Text className="text-[13px] text-ink-muted">{eyebrow}</Text> : null}
        <Text className="text-[18px] font-extrabold text-ink-strong">{title}</Text>
      </View>

      {right}
    </View>
  );
}
