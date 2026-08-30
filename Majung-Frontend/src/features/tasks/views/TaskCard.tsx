// 카드를 펼쳤을 때 나오는 본문 (§6.1 · 2026-08-23 시안).
// 채팅은 이 카드 안에 그리지 않는다. "AI 챗봇과 대화하기"를 누르면 화면 전체를 덮는 팝업이 열린다.
//
// 카드 머리(제목·번호·기관)는 TaskRow가 그린다. 여기는 그 아래 내용만 맡는다.
import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "@/shared/components/Button";
import { NoteBox, NoteLine } from "@/shared/components/NoteBox";
import { COLORS } from "@/shared/theme/colors";
import { joinKorean, josa } from "@/shared/utils/korean";

import type { Task } from "../domain/task";
import { visitPlaceOf, VISIT_PENDING_NOTE } from "../domain/visitPlace";
import { Icon } from "@/shared/components/Icon";

type Props = {
  task: Task;
  /** 아직 마치지 않은 선행 필수 항목들. 있으면 먼저 하도록 유도한다. 차단이 아니라 유도다 (§5.2). */
  pendingMust: readonly string[];
  onOpenChat: () => void;
  onNotifyStaff?: () => void;
  onComplete: () => void;
  /**
   * 완료를 되돌린다. **실수로 누르는 일이 실제로 일어난다.**
   * 되돌릴 길이 없으면 그 항목의 안내와 연락처를 다시 볼 수 없게 된다.
   */
  onUncomplete?: () => void;
  /** 보낸 방문 요청의 상태 표시 (§7.1). 라우트가 조립해 넣는다. */
  statusStrip?: React.ReactNode;
  /**
   * 근처 기관 구역 (§5.4).
   *
   * **카드가 직접 서버를 부르지 않는다.** 카드는 여러 개가 한 화면에 있고, 각자
   * 부르면 열 몇 번의 요청이 동시에 나간다. 열린 카드 하나만 라우트가 채운다.
   */
  nearby?: React.ReactNode;
};

export function TaskCard({
  task,
  pendingMust,
  onOpenChat,
  onNotifyStaff,
  onComplete,
  onUncomplete,
  statusStrip,
  nearby,
}: Props) {
  // 선행 필수를 남겨 둔 채 뒤 순서를 열었을 때만 유도 문구를 낸다.
  //
  // **완료 상태를 여기서 다루지 않는다.** 서버가 마친 항목을 목록에서 빼기 때문에
  // 끝낸 카드는 화면에 오지 않는다. 그 자리에 있던 "끝낸 일이에요" 분기는 죽은 코드였다.
  const showGuide = !task.must && pendingMust.length > 0;

  // 방문 예약을 받는 곳. 전화 문의처(`contact.org`)와 다른 값이다.
  const place = visitPlaceOf(task.id);
  const [pendingNote, setPendingNote] = useState(false);

  return (
    <View className="px-4 pb-4 pt-4">
      {/* 차단이 아니라 유도다. 먼저 하면 쉬워진다고 알리되 지금 봐도 된다고 말한다 (§5.2).
          아이콘을 열쇠에서 돋보기로 바꿨다 (2026-08-31 시안) — 잠긴 것을 여는 그림은
          "먼저 해야 열린다"로 읽히는데, 실제로는 막고 있지 않고 권하는 자리다 */}
      {showGuide ? (
        <NoteBox tone="warn" icon="search" className="mb-4">
          {/* **뒷문장을 걷었다.** "그래도 지금 보고 싶으시면 계속 보셔도 괜찮아요"는
              막지 않는다는 말인데, 애초에 막고 있지 않으므로 없는 걱정을 만들었다 */}
          {`${pendingMust.join("과 ")}를 먼저 마치면 이 일이 훨씬 쉬워져요.`}
        </NoteBox>
      ) : null}

      <View className="mb-4">
        {task.info.map((line) => (
          <View key={line} className="mb-2 flex-row pr-1">
            {/* 24px은 시안 실측값이다. 16px로 두었더니 글자에 눌려 잘 안 보였다 */}
            <View className="mr-2">
              <Icon name="check" size={24} color={COLORS.doneMark} />
            </View>
            <Text className="flex-1 text-body text-ink-body">{line}</Text>
          </View>
        ))}
      </View>

      {/* 갈 곳이 하나로 정해지는 항목은 전화번호보다 창구 안내가 먼저 온다 (§6.4). */}
      {task.desk ? (
        // **문자열 조각을 NoteBox에 직접 넘기지 않는다.** NoteBox는 자식이 문자열
        // 하나일 때만 Text로 감싸는데, 여기는 값이 섞여 조각이 여럿이라 그대로 View의
        // 자식이 된다. 웹은 견디지만 **안드로이드는 텍스트를 View에 못 넣어 터진다.**
        <NoteBox tone="info" className="mb-4">
          <NoteLine tone="info">
            {task.desk.place}에 가서 “{task.desk.say}”라고 말하면 돼요.
          </NoteLine>
        </NoteBox>
      ) : null}

      {/* **창구 안내 바로 아래가 이 자리다.** 위가 "무슨 말을 하면 되는지"이고
          여기가 "어느 곳으로 가면 되는지"다. §5.4가 "가까운 주민센터라고만 하면
          사용자는 다시 찾아야 한다"고 적어둔 그 자리다 */}
      {nearby}

      {/* 시안의 회색 안내 상자. 창구 안내(파랑)와 층이 갈리게 색을 낮춘다 —
          갈 곳이 정해진 항목에서는 창구가 먼저 읽혀야 한다 (§6.4) */}
      {task.contact ? (
        <View className="mb-4 rounded-xl px-4 py-3" style={{ backgroundColor: COLORS.bubble }}>
          <Text className="text-caption text-ink-sub">
            더 물어볼 것이 있으면 {task.contact.org} {task.contact.phone}
            {josa(task.contact.phone, "으로", "로")} 전화해 주세요.
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
        <Button icon="chat" label="AI 챗봇과 대화하기" onPress={onOpenChat} />
        {task.visitLabel && onNotifyStaff && place ? (
          <>
            {/* **어디에 가는 것인지가 먼저다.** "숙식제공 담당자"는 우리 쪽 분류
                이름이라 사용자에게는 그런 사람이 어디 있는지 짚이지 않는다.
                **기관 이름은 `visitPlace`가 정한다** — 전에는 `contact.org`를 썼는데
                그것은 전화 문의처라, 콜센터에 방문 예약을 거는 라벨이 나왔다 */}
            <Button
              icon="bell"
              label={`${place.label}에 방문 예약하기`}
              tone="secondary"
              ink={place.pending ? COLORS.inkMuted : COLORS.brand}
              // 협의 중인 곳은 요청을 보내지 않고 왜 못 보내는지 알린다.
              // 웹에서는 올려 보기만 해도 알 수 있고, 앱에서는 눌러야 안다.
              onPress={place.pending ? () => setPendingNote(true) : onNotifyStaff}
              onHoverIn={place.pending ? () => setPendingNote(true) : undefined}
              onHoverOut={place.pending ? () => setPendingNote(false) : undefined}
            />
            {place.pending && pendingNote ? (
              <Text className="px-1 text-caption text-ink-muted">{VISIT_PENDING_NOTE}</Text>
            ) : null}
          </>
        ) : null}
        {task.done ? (
          <Button
            icon="undo"
            label="아직 안 끝났어요"
            tone="secondary"
            onPress={onUncomplete ?? onComplete}
          />
        ) : (
          <Button
            icon="checkCircle"
            label="이 일을 끝냈어요"
            tone="secondary"
            ink={COLORS.doneInk}
            onPress={onComplete}
          />
        )}
      </View>
    </View>
  );
}
