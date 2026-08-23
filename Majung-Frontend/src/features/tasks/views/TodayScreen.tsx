// 홈 화면 — 오늘의 할 일 (§5).
// 서류철 인덱스 탭을 옆으로 눕힌 모양의 아코디언이며, 한 번에 하나만 열린다.
//
// AI 채팅 팝업과 도움 연결 화면은 이 화면이 직접 열지 않는다. 라우트가 조립한다.
// 다른 feature를 화면이 직접 가져다 쓰지 않는다는 규약(Majung-Frontend/CLAUDE.md) 때문이다.
import { useCallback, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { RouteId, Task } from "../domain/task";

import { TaskCard } from "./TaskCard";
import { TaskRow } from "./TaskRow";

type Props = {
  tasks: readonly Task[];
  /** 지금 열려 있는 탭. 완료하면 다음 미완료 항목으로 옮겨간다 (§5.2). */
  openId: RouteId | null;
  onToggle: (taskId: RouteId) => void;
  /** 완료 처리. 서버가 목록을 다시 계산해 마친 항목을 뺀다 */
  onComplete: (taskId: RouteId) => void;
  /** 아직 마치지 않은 선행 필수 항목의 제목들. */
  pendingMust: readonly string[];
  /** 강조 배지가 붙는 항목. */
  headId: RouteId | null;
  /** 인사말에 쓸 이름. 가입할 때 받은 값이며 이름만으로는 위험이 낮다 (§2.5-1). */
  userName?: string;
  /** 할 일별 AI 채팅 팝업을 연다. */
  onOpenChat: (taskId: RouteId) => void;
  /** 상시 도움 연결 화면을 연다 (§5.3). */
  onOpenHelp: () => void;
  /** 담당자에게 방문을 미리 알린다 (§7.2). 동의하지 않았으면 넘기지 않는다. */
  onNotifyStaff?: (taskId: RouteId) => void;
  /** 이미 보낸 요청이 있으면 그 상태 표시를 그린다 (§7.1). */
  renderStatusStrip?: (taskId: RouteId) => React.ReactNode;
  /** 이 할 일에 알리기 버튼을 감출지. 이미 보낸 요청이 있을 때 참이다. */
  hideNotifyFor?: (taskId: RouteId) => boolean;
};

export function TodayScreen({
  tasks,
  openId,
  onToggle,
  onComplete,
  pendingMust,
  headId,
  userName,
  onOpenChat,
  onOpenHelp,
  onNotifyStaff,
  renderStatusStrip,
  hideNotifyFor,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const rowOffsets = useRef<Record<string, number>>({});

  // 완료 후 다음 탭이 열릴 때 그 위치로 스크롤한다. 열렸는데 화면 밖이면 열린 줄 모른다 (§5.2).
  const handleComplete = useCallback(
    (id: RouteId) => {
      onComplete(id);
      const next = tasks.find((t) => t.id !== id);
      const y = next ? rowOffsets.current[next.id] : undefined;
      if (y !== undefined) {
        setTimeout(
          () => scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true }),
          120,
        );
      }
    },
    [onComplete, tasks],
  );

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top"]}>
      {/* 도움 연결은 스크롤해도 사라지지 않는다. 할 일 진행과 무관하게 언제든 닿아야 한다 (§5.3). */}
      <View className="flex-row items-center gap-3 border-b border-line bg-white px-5 py-3">
        <View className="flex-1">
          <Text className="text-[15px] text-ink-muted">
            {userName ? `${userName}님, 어서 오세요` : "어서 오세요"}
          </Text>
          <Text className="mt-0.5 text-[21px] font-extrabold text-ink-strong">오늘의 할 일</Text>
        </View>
        <Pressable
          onPress={onOpenHelp}
          accessibilityRole="button"
          accessibilityLabel="도움이 필요해요. 전화 상담 번호를 봐요"
          className="rounded-full bg-sun-500 px-4 py-2.5 active:opacity-90"
        >
          <Text className="text-[15px] font-extrabold text-white">도움이 필요해요</Text>
        </Pressable>
      </View>

      <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="px-5 pb-16 pt-5">
        <Text className="mb-5 text-[13px] leading-[21px] text-ink-muted">
          {tasks.length > 0
            ? `아직 ${tasks.length}개 남았어요 — 서두르지 않아도 괜찮아요.`
            : ""}
        </Text>

        {tasks.map((task, index) => (
          <View
            key={task.id}
            onLayout={(e) => {
              rowOffsets.current[task.id] = e.nativeEvent.layout.y;
            }}
          >
            <TaskRow
              task={task}
              index={index}
              done={false}
              open={openId === task.id}
              highlighted={task.id === headId}
              onToggle={() => onToggle(task.id)}
            >
              <TaskCard
                task={task}
                done={false}
                pendingMust={pendingMust}
                onOpenChat={() => onOpenChat(task.id)}
                onNotifyStaff={
                  onNotifyStaff && !hideNotifyFor?.(task.id)
                    ? () => onNotifyStaff(task.id)
                    : undefined
                }
                onComplete={() => handleComplete(task.id)}
                statusStrip={renderStatusStrip?.(task.id)}
              />
            </TaskRow>
          </View>
        ))}

        {tasks.length === 0 ? (
          <View className="mt-6 rounded-2xl border border-folder-done-line bg-folder-done-bg px-5 py-6">
            <Text className="text-center text-lg font-extrabold text-folder-done-ink">
              오늘 할 일을 다 마치셨어요.
            </Text>
            <Text className="mt-2 text-center text-[15px] leading-[25px] text-folder-done-ink">
              천천히 하셔도 괜찮아요.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
