// 카드를 펼쳤을 때 나오는 본문 (§6.1 · 2026-08-23 시안).
// 채팅은 이 카드 안에 그리지 않는다. "AI 챗봇과 대화하기"를 누르면 화면 전체를 덮는 팝업이 열린다.
//
// 카드 머리(제목·번호·기관)는 TaskRow가 그린다. 여기는 그 아래 내용만 맡는다.
import { Text, View } from "react-native";

import { Button } from "@/shared/components/Button";
import { NoteBox } from "@/shared/components/NoteBox";
import { COLORS } from "@/shared/theme/colors";

import type { Task } from "../domain/task";

type Props = {
  task: Task;
  /** 아직 마치지 않은 선행 필수 항목들. 있으면 먼저 하도록 유도한다. 차단이 아니라 유도다 (§5.2). */
  pendingMust: readonly string[];
  onOpenChat: () => void;
  onNotifyStaff?: () => void;
  onComplete: () => void;
  /** 보낸 방문 요청의 상태 표시 (§7.1). 라우트가 조립해 넣는다. */
  statusStrip?: React.ReactNode;
};

export function TaskCard({
  task,
  pendingMust,
  onOpenChat,
  onNotifyStaff,
  onComplete,
  statusStrip,
}: Props) {
  // 선행 필수를 남겨 둔 채 뒤 순서를 열었을 때만 유도 문구를 낸다.
  //
  // **완료 상태를 여기서 다루지 않는다.** 서버가 마친 항목을 목록에서 빼기 때문에
  // 끝낸 카드는 화면에 오지 않는다. 그 자리에 있던 "끝낸 일이에요" 분기는 죽은 코드였다.
  const showGuide = !task.must && pendingMust.length > 0;

  return (
    <View className="px-4 pb-4 pt-4">
      {/* 차단이 아니라 유도다. 먼저 하면 쉬워진다고 알리되 지금 봐도 된다고 말한다 (§5.2) */}
      {showGuide ? (
        <NoteBox tone="warn" icon="🔑" className="mb-4">
          {`${pendingMust.join("과 ")}를 먼저 마치면 이 일이 훨씬 쉬워져요.\n그래도 지금 보고 싶으시면 계속 보셔도 괜찮아요.`}
        </NoteBox>
      ) : null}

      <View className="mb-4">
        {task.info.map((line) => (
          <View key={line} className="mb-2 flex-row pr-1">
            <Text className="mr-2 text-body font-extrabold" style={{ color: COLORS.doneInk }}>
              ✓
            </Text>
            <Text className="flex-1 text-body text-ink-body">{line}</Text>
          </View>
        ))}
      </View>

      {/* 갈 곳이 하나로 정해지는 항목은 전화번호보다 창구 안내가 먼저 온다 (§6.4). */}
      {task.desk ? (
        <NoteBox tone="info" className="mb-4">{task.desk.place}에 가서 “{task.desk.say}”라고 말하면 돼요.</NoteBox>
      ) : null}

      {/* 시안의 회색 안내 상자. 창구 안내(파랑)와 층이 갈리게 색을 낮춘다 —
          갈 곳이 정해진 항목에서는 창구가 먼저 읽혀야 한다 (§6.4) */}
      {task.contact ? (
        <View className="mb-4 rounded-xl px-4 py-3" style={{ backgroundColor: COLORS.bubble }}>
          <Text className="text-caption text-ink-sub">
            더 물어볼 것이 있으면 {task.contact.org} {task.contact.phone}으로 전화해 주세요.
          </Text>
          {task.contact.hours ? (
            <Text className="mt-1 text-caption text-ink-sub">
              전화받는 시간은 {task.contact.hours}예요.
            </Text>
          ) : null}
        </View>
      ) : null}

      {statusStrip}

      {/* 세 버튼의 순서가 곧 권하는 순서다. 물어보기가 먼저이고 끝냈다는 표시가 마지막이다 */}
      <View className="gap-2">
        <Button icon="💬" label="AI 챗봇과 대화하기" onPress={onOpenChat} />
        {task.visitLabel && onNotifyStaff ? (
          <Button
            icon="🔔"
            label={`${task.visitLabel} 담당자에게 미리 알리기`}
            tone="secondary"
            onPress={onNotifyStaff}
          />
        ) : null}
        <Button icon="✅" label="이 일을 끝냈어요" tone="secondary" onPress={onComplete} />
      </View>
    </View>
  );
}
