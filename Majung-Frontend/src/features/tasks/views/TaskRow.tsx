// 서류철 인덱스 탭 한 행 (§5.1).
// 프로토타입은 색깔 탭을 position:absolute로 카드 밖 54px에 띄우는데, React Native는
// 안드로이드에서 부모 경계를 넘어간 자식을 잘라낸다. 그래서 [카드 | 탭]을 가로로 붙이고
// 탭을 카드 안쪽으로 14px 물려서 같은 인상을 클리핑 없이 낸다.
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";

import {
  FOLDER_DONE,
  TAB_HEIGHT,
  TAB_OUT,
  TAB_OVERLAP,
  TAB_STEP,
  folderColor,
} from "../domain/palette";
import type { Task } from "../domain/task";

type Props = {
  task: Task;
  /** 목록에서의 순서. 색 배정과 계단식 어긋남의 기준이다. */
  index: number;
  done: boolean;
  open: boolean;
  /** 오늘 가장 먼저 하면 좋은 항목. 강조 배지가 붙는다. */
  highlighted: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
};

function FirstBadge() {
  return (
    <View className="mb-1.5 flex-row justify-end" style={{ marginRight: TAB_OUT - 26 }}>
      <View className="rounded-[10px] bg-ink-strong px-2.5 py-1.5">
        <Text className="text-xs font-extrabold text-white">오늘은 이것부터 해보세요</Text>
      </View>
      {/* 말풍선 꼬리 — 배지 아래를 가리킨다. 좌표는 배지 오른쪽 끝에서 안쪽으로 26px이다. */}
      <View
        className="absolute -bottom-1.5 right-[26px] size-0"
        style={{
          borderLeftWidth: 6,
          borderRightWidth: 6,
          borderTopWidth: 6,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: COLORS.inkStrong,
        }}
      />
    </View>
  );
}

function TaskRowBase({ task, index, done, open, highlighted, onToggle, children }: Props) {
  const color = folderColor(index);

  return (
    // 계단식 어긋남 — 항목마다 13px씩 좁혀 탭들이 계단처럼 보이게 한다.
    <View style={{ marginRight: index * TAB_STEP, marginBottom: 10 }}>
      {highlighted && !done ? <FirstBadge /> : null}

      <View className="flex-row items-center">
        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${task.title}. ${done ? "끝낸 일이에요" : task.meta}`}
          className="flex-1 flex-row items-center gap-2.5 border-[1.5px] bg-white py-4 pl-3.5 pr-3 active:opacity-90"
          style={{
            borderLeftWidth: 5,
            borderLeftColor: done ? FOLDER_DONE.tab : color,
            borderColor: done ? FOLDER_DONE.headLine : COLORS.line,
            backgroundColor: done ? FOLDER_DONE.headBg : COLORS.surface,
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: open ? 0 : 12,
            borderTopRightRadius: 4,
            borderBottomRightRadius: open ? 0 : 4,
          }}
        >
          <View
            className="size-[26px] items-center justify-center rounded-full"
            style={{ backgroundColor: done ? FOLDER_DONE.tab : color }}
          >
            <Text className="text-[13px] font-extrabold text-white">{done ? "✓" : index + 1}</Text>
          </View>

          <View className="flex-1">
            <Text
              className="text-[16.5px] font-extrabold leading-[22px]"
              style={
                done
                  ? { color: FOLDER_DONE.title, textDecorationLine: "line-through" }
                  : { color: COLORS.inkStrong }
              }
            >
              {task.title}
            </Text>
            <Text className="mt-0.5 text-[12.5px] text-ink-muted">
              {task.meta}
              {/* 끝낸 일에는 순서 안내가 필요 없다. 취소선 안에 남으면 읽는 데 방해가 된다. */}
              {task.must && !done ? " · " : ""}
              {task.must && !done ? (
                <Text className="font-extrabold text-sun-700">먼저 할 일</Text>
              ) : null}
            </Text>
          </View>
        </Pressable>

        {/* 행 밖으로 54px 나온 것처럼 보이는 색깔 탭 */}
        <View
          className="justify-center rounded-r-[10px] pr-2"
          style={{
            width: TAB_OUT + TAB_OVERLAP,
            height: TAB_HEIGHT,
            marginLeft: -TAB_OVERLAP,
            backgroundColor: done ? FOLDER_DONE.tab : color,
            boxShadow: "2px 2px 6px rgba(0, 0, 0, 0.13)",
          }}
        >
          <Text className="text-right text-[11.5px] font-extrabold text-white" numberOfLines={1}>
            {task.tabLabel}
          </Text>
        </View>
      </View>

      {/* 펼쳐진 카드 — 탭이 차지한 폭만큼 오른쪽을 비워 머리와 폭을 맞춘다 */}
      {open ? <View style={{ marginRight: TAB_OUT }}>{children}</View> : null}
    </View>
  );
}

export const TaskRow = memo(TaskRowBase);
