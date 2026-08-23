// 홈 화면 — 오늘의 할 일 (§5).
// 서류철 인덱스 탭을 옆으로 눕힌 모양의 아코디언이며, 한 번에 하나만 열린다.
//
// AI 채팅 팝업과 도움 연결 화면은 이 화면이 직접 열지 않는다. 라우트가 조립한다.
// 다른 feature를 화면이 직접 가져다 쓰지 않는다는 규약(Majung-Frontend/CLAUDE.md) 때문이다.
import { useCallback, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "@/shared/components/AppHeader";
import { COLORS } from "@/shared/theme/colors";

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
  /** 근처 기관 구역 (§5.4). 열린 카드에만 그린다. */
  renderNearby?: (taskId: RouteId) => React.ReactNode;
  /** 처음 받은 할 일 개수. 진행 표시의 분모다. */
  total?: number;
};

/**
 * 진행 표시 (2026-08-23 시안).
 *
 * 몇 개 중 몇 개인지가 없으면 목록이 끝이 없어 보인다. 마친 것을 세는 것이 아니라
 * **남은 것에서 거꾸로 센다** — 서버가 마친 항목을 목록에서 빼기 때문이다.
 */
function Progress({ done, total }: { done: number; total: number }) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <View className="mb-5">
      <View className="mb-2 flex-row items-end justify-between">
        <Text className="text-body font-extrabold" style={{ color: COLORS.brand }}>
          진행 상황
        </Text>
        <Text className="text-body font-bold text-ink-sub">
          {done} / {total}
        </Text>
      </View>
      <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: COLORS.line }}>
        <View
          className="h-full rounded-full"
          style={{ backgroundColor: COLORS.brand, width: `${ratio * 100}%` }}
        />
      </View>
    </View>
  );
}

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
  renderNearby,
  total,
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
      <AppHeader
        actionLabel="도움이 필요해요"
        actionHint="도움이 필요해요. 전화 상담 번호를 봐요"
        onAction={onOpenHelp}
      />

      <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="px-5 pb-16 pt-5">
        <Progress done={Math.max(0, (total ?? tasks.length) - tasks.length)} total={total ?? tasks.length} />

        <Text className="text-body text-ink-sub">
          {userName ? `${userName}님, 어서 오세요.` : "어서 오세요."}
        </Text>
        <Text className="mt-1 text-display font-extrabold text-ink-strong">오늘의 할 일</Text>
        <Text className="mb-6 mt-2 text-body text-ink-sub">
          어려운 상황에서도 한 걸음씩 나아갈 수 있도록{"\n"}꼭 필요한 일만 골라 두었어요.
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
                pendingMust={pendingMust}
                onOpenChat={() => onOpenChat(task.id)}
                onNotifyStaff={
                  onNotifyStaff && !hideNotifyFor?.(task.id)
                    ? () => onNotifyStaff(task.id)
                    : undefined
                }
                onComplete={() => handleComplete(task.id)}
                statusStrip={renderStatusStrip?.(task.id)}
                nearby={renderNearby?.(task.id)}
              />
            </TaskRow>
          </View>
        ))}

        {tasks.length === 0 ? (
          <View className="mt-6 rounded-2xl border border-folder-done-line bg-folder-done-bg px-5 py-6">
            <Text className="text-center text-heading font-extrabold text-folder-done-ink">
              오늘 할 일을 다 마치셨어요.
            </Text>
            <Text className="mt-2 text-center text-body text-folder-done-ink">
              천천히 하셔도 괜찮아요.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
