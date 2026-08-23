// 할 일 카드 한 장 (§5.1 · 2026-08-23 시안).
//
// **서류철 인덱스 탭에서 카드 목록으로 바뀌었다.** 옆으로 튀어나온 색깔 탭과 계단식
// 들여쓰기를 걷어내고, 번호가 붙은 카드가 세로로 쌓이는 모양이 되었다.
//
// 무엇이 남았나
//   - **한 번에 하나만 열린다.** 저리터러시 사용자에게 한 화면에 한 가지가 원칙이다
//   - **지금 할 일이 눈에 띈다.** 옛 구조에서는 튀어나온 탭이 그 일을 했고, 지금은
//     테두리와 번호 색이 한다
//
// 번호 색은 옛 인덱스 탭 색을 그대로 쓴다. 분류가 아니라 **순서**를 가리키는 것으로
// 뜻이 바뀌었지만, 위에서부터 빨강→주황→노랑으로 옅어지는 배열이 순서에도 맞는다.
import { Pressable, Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import { folderColor, FOLDER_DONE } from "../domain/palette";
import type { Task } from "../domain/task";

type Props = {
  task: Task;
  /** 목록에서 몇 번째인지. 번호 배지와 색에 쓴다. */
  index: number;
  done: boolean;
  open: boolean;
  /** 지금 해야 할 일. 테두리를 둘러 눈에 띄게 한다. */
  highlighted: boolean;
  onToggle: () => void;
  /** 펼쳤을 때 나오는 카드 본문. 라우트가 조립해 넣는다. */
  children?: React.ReactNode;
};

/** 순서 번호. 시안의 원형 배지다. */
function NumberBadge({ n, color }: { n: number; color: string }) {
  return (
    <View
      className="size-7 items-center justify-center rounded-full"
      style={{ backgroundColor: color }}
    >
      <Text className="text-body font-extrabold text-white">{n}</Text>
    </View>
  );
}

/**
 * 선행조건 표시.
 *
 * 시안에는 "긴급도 높음"으로 되어 있으나 **그 말을 쓰지 않는다.** 서버가 주는 값은
 * `blocks_others`이고 "다른 항목의 선행조건"이라는 뜻이지 급한 정도가 아니다.
 * 급하지 않은데 급하다고 적으면 정말 급한 일과 구별이 사라진다.
 */
function MustBadge() {
  return (
    <View
      className="self-start rounded-full px-3 py-1.5"
      style={{ backgroundColor: COLORS.alertSoft }}
    >
      <Text className="text-caption font-extrabold" style={{ color: COLORS.alert }}>
        먼저 하면 좋아요
      </Text>
    </View>
  );
}

export function TaskRow({ task, index, done, open, highlighted, onToggle, children }: Props) {
  const accent = done ? FOLDER_DONE.tab : folderColor(index);
  // 열린 카드와 지금 할 일에만 테두리를 준다. 전부에 두르면 아무것도 눈에 띄지 않는다.
  const outlined = highlighted && !done;

  return (
    <View
      className="mb-3 overflow-hidden rounded-2xl bg-white"
      style={{
        borderWidth: outlined ? 2 : 1,
        borderColor: outlined ? COLORS.alert : done ? FOLDER_DONE.headLine : COLORS.lineStrong,
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${index + 1}번째 할 일. ${task.title}. ${task.meta}. ${
          open ? "눌러서 접기" : "눌러서 자세히 보기"
        }`}
        className="px-4 py-4 active:opacity-90"
        style={{ backgroundColor: done ? FOLDER_DONE.headBg : COLORS.surface }}
      >
        {/* 선행조건 배지는 열린 카드에서만 위로 올라온다. 접힌 카드에서는 제목 아래에 붙어
            목록이 위아래로 들쭉날쭉해지지 않는다 */}
        {task.must && !done && open ? (
          <View className="mb-2.5">
            <MustBadge />
          </View>
        ) : null}

        <View className="flex-row items-center gap-2.5">
          <NumberBadge n={index + 1} color={accent} />
          <Text
            className="flex-1 text-heading font-extrabold"
            style={{ color: done ? FOLDER_DONE.title : COLORS.inkStrong }}
          >
            {task.title}
          </Text>
          {done ? (
            <Text className="text-body font-extrabold" style={{ color: FOLDER_DONE.title }}>
              ✓ 끝
            </Text>
          ) : (
            <Text className="text-2xl" style={{ color: COLORS.inkMuted }}>
              {open ? "⌃" : "⌄"}
            </Text>
          )}
        </View>

        <View className="ml-[38px] mt-1 flex-row flex-wrap items-center gap-2">
          <Text className="text-caption text-ink-sub">{task.meta}</Text>
          {task.must && !done && !open ? <MustBadge /> : null}
        </View>
      </Pressable>

      {open && children ? <View className="border-t border-line">{children}</View> : null}
    </View>
  );
}
