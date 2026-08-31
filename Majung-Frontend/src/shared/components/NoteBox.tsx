// 안내 상자. 본문 흐름에서 한 겹 떠 있는 말이다.
//
// 스물세 곳에 흩어져 있었고 모서리·여백이 **아홉 가지로 갈려 있었다.** `rounded-xl`과
// `rounded-lg`와 `rounded-2xl`이, `py-3`과 `py-4`가 섞였다. 같은 성격의 말인데 화면마다
// 다르게 생기면 사용자는 그것이 다른 종류의 말인 줄 안다.
//
// **색이 곧 뜻이다.**
//
//   info   확인된 안내. 이대로 하시면 된다는 말
//   warn   참고하거나 주의할 것. 지금 당장 하는 일은 아니다
//   alert  되돌릴 수 없거나 위험한 것
//
// 세 가지를 넘기지 않는다. 넷째가 필요해 보이면 대개 셋 중 하나로 읽히는 말이다.
import { Text, View } from "react-native";

import { COLORS } from "../theme/colors";
import { Icon, type IconName } from "./Icon";

export type NoteTone = "info" | "warn" | "alert";

type Props = {
  tone?: NoteTone;
  children: React.ReactNode;
  /** 본문 위에 굵게 붙는 한 줄. 없으면 자리를 만들지 않는다. */
  title?: string;
  /** 문장 앞에 붙는 그림. 글을 읽기 어려운 사람에게 종류를 먼저 알린다. */
  icon?: IconName;
  /** 바깥 여백. 상자 스스로 정하지 않고 놓는 쪽이 정한다. */
  className?: string;
};

const TONES: Record<NoteTone, { bg: string; line: string; ink: string }> = {
  info: { bg: COLORS.noteInfo, line: COLORS.noteInfoLine, ink: COLORS.noteInfoInk },
  warn: { bg: COLORS.noteWarn, line: COLORS.noteWarnLine, ink: COLORS.noteWarnInk },
  alert: { bg: COLORS.alertSoft, line: COLORS.alertLine, ink: COLORS.alertInk },
};

export function NoteBox({ tone = "info", children, title, icon, className }: Props) {
  const c = TONES[tone];
  // 문장 하나면 상자가 감싸 주고, 줄이 여럿이면 놓는 쪽이 직접 짠다.
  // 두 경우를 한 컴포넌트가 받아야 스물세 곳이 여기로 모인다.
  const plain = typeof children === "string";
  return (
    <View
      className={`rounded-2xl border px-4 py-4 ${className ?? ""}`}
      style={{ backgroundColor: c.bg, borderColor: c.line }}
    >
      {/* 그림은 글 옆에 나란히 둔다. 글 앞에 이어 붙이면 기기마다 크기가 달라지고
          줄이 넘어갈 때 두 번째 줄이 그림 아래로 들어가 어긋난다 */}
      {title ? (
        <View className="mb-2 flex-row items-center gap-2">
          {icon ? <Icon name={icon} size={24} color={c.ink} /> : null}
          <Text className="flex-1 text-body font-extrabold" style={{ color: c.ink }}>
            {title}
          </Text>
        </View>
      ) : null}
      {plain ? (
        !title && icon ? (
          <View className="flex-row items-start gap-2">
            <Icon name={icon} size={24} color={c.ink} />
            <Text className="flex-1 text-body" style={{ color: c.ink }}>
              {children}
            </Text>
          </View>
        ) : (
          <Text className="text-body" style={{ color: c.ink }}>
            {children}
          </Text>
        )
      ) : (
        children
      )}
    </View>
  );
}

/** 상자 안의 한 줄. 색을 매번 적지 않도록 톤에 맞춘 글자색을 붙여 준다. */
export function NoteLine({
  tone = "info",
  className,
  children,
}: {
  tone?: NoteTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Text className={`text-body ${className ?? ""}`} style={{ color: TONES[tone].ink }}>
      {children}
    </Text>
  );
}
