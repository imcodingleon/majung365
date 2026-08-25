// 홈 — 오늘의 할 일 (§5).
//
// 화면들을 조립하는 자리다. 할 일 목록 위에 AI 채팅 팝업(§6.1)·도움 연결(§5.3)·방문 알림(§7)이
// 얹힌다. 팝업을 닫으면 보고 있던 탭이 열린 그 상태로 돌아온다. 페이지 이동이 아니기 때문이다.
//
// **할 일 목록은 서버가 만든다.** 초기 진단 답변을 보내면 지원 항목이 정해져 돌아온다.
// 완료 처리도 서버가 목록을 다시 계산하는 방식이라 기기는 마친 항목만 들고 있으면 된다.
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Redirect } from "expo-router";

import { useTaskThreads } from "@/features/chat/hooks/useTaskThreads";
import { ChatPopup } from "@/features/chat/views/ChatPopup";
import { HelpScreen } from "@/features/help";
import type { RouteId } from "@/features/tasks/domain/task";
import { toTasks } from "@/features/tasks/domain/fromServer";
import { useNearbyPlaces, nearbyKindFor } from "@/features/tasks/hooks/useNearbyPlaces";
import { NearbyPlaces } from "@/features/tasks/views/NearbyPlaces";
import { useServerTasks } from "@/features/tasks/hooks/useServerTasks";
import { TodayScreen } from "@/features/tasks";
import { limitMessage, type VisitRequest } from "@/features/visit/domain/request";
import { useVisitRequests } from "@/features/visit/hooks/useVisitRequests";
import { RequestStatusStrip } from "@/features/visit/views/RequestStatusStrip";
import { UserChatSheet } from "@/features/visit/views/UserChatSheet";
import { VisitRequestSheet } from "@/features/visit/views/VisitRequestSheet";
import { NoteBox } from "@/shared/components/NoteBox";
import { getSession } from "@/shared/utils/session";
import { FramedModal } from "@/shared/components/FramedModal";

export default function TodayRoute() {
  const session = getSession();
  const server = useServerTasks(
    session?.answers ?? null,
    session?.tasks ? toTasks(session.tasks) : undefined,
    // 되살린 세션이면 마쳐 있던 항목이 함께 온다 (§5.2).
    (session?.completed as RouteId[] | undefined) ?? undefined,
  );
  const chat = useTaskThreads();
  const visit = useVisitRequests();
  const [helpOpen, setHelpOpen] = useState(false);
  /**
   * 담당자 채팅을 연 방문 요청. **방은 요청 하나에 하나다**(§7.3) — 할 일이 아니라
   * 요청을 들고 있어야 어느 방을 열지 정해진다.
   */
  const [staffChatFor, setStaffChatFor] = useState<VisitRequest | null>(null);
  // 아코디언 열림은 화면 상태다. 아무것도 안 골랐으면 첫 항목이 열린 채로 시작한다 (§5.2).
  const [openId, setOpenId] = useState<RouteId | null>(null);

  // **열린 카드 하나만 부른다** (§5.4). 위치는 가입할 때 알아낸 것이며 세션에만 있다.

  const tasks = server.tasks;
  // **아직 안 한 것 중 첫 번째가 "지금 할 것"이다.** 마친 항목도 목록에 남으므로(§5.2)
  // 그냥 첫 항목을 잡으면 이미 끝낸 일이 계속 강조된다.
  const headId = tasks.find((t) => !t.done)?.id ?? null;
  // **`openId`가 아니라 실제로 열린 것을 본다.** 아무것도 안 고른 처음에는 `openId`가
  // 비어 있고 첫 항목이 열린 채로 시작하는데(§5.2), 그때 `openId`만 보면 근처 기관을
  // 부르지 않아 **가장 많이 보게 되는 첫 화면에서만 비는** 상태가 된다.
  const shownId = openId ?? headId;
  const nearby = useNearbyPlaces(shownId, session?.place ?? null);

  const pendingMust = tasks.filter((t) => t.must).map((t) => t.title);

  const toggle = useCallback((id: RouteId) => setOpenId((prev) => (prev === id ? null : id)), []);

  const complete = useCallback(
    (id: RouteId) => {
      server.complete(id);
      // **마친 탭이 닫히면서 다음 미완료 탭이 열린다** (§5.2). 전부 닫아 버리면
      // 무엇부터 해야 하는지 사용자가 다시 판단해야 하는데, 이 서비스의 전제가
      // "한 번에 하나만, 판단하지 않게"다. 마지막 하나였으면 모두 닫는다.
      const next = tasks.find((t) => t.id !== id && !t.done);
      setOpenId(next?.id ?? null);
    },
    [server, tasks],
  );

  /** 되돌리면 그 탭을 다시 연다. 무엇이 되살아났는지 눈으로 확인할 수 있어야 한다. */
  const uncomplete = useCallback(
    (id: RouteId) => {
      server.uncomplete(id);
      setOpenId(id);
    },
    [server],
  );

  const chatTask = tasks.find((t) => t.id === chat.openTaskId) ?? null;
  const visitTask = tasks.find((t) => t.id === visit.formTaskId) ?? null;

  // 이번에 가입하지 않았으면 볼 것이 없다. 서버가 아직 아무것도 저장하지 않기 때문이다.
  if (!session) return <Redirect href="/signup" />;

  return (
    <>
      <TodayScreen
        tasks={tasks}
        openId={openId ?? headId}
        onToggle={toggle}
        onComplete={complete}
        onUncomplete={uncomplete}
        renderNearby={(taskId) =>
          taskId === shownId && !nearby.loading ? (
            <NearbyPlaces
              offices={nearby.offices}
              institutions={nearby.institutions}
              place={session?.place ?? null}
              // 신분증은 어느 주민센터에서나 된다. 그 말이 없으면 자기 동 주민센터를
              // 찾아 멀리 가는 사람이 생긴다 (§5.4)
              anyBranch={nearbyKindFor(taskId) === "office"}
            />
          ) : null
        }
        pendingMust={pendingMust}
        headId={headId}
        total={server.total}
        userName={session.name}
        onOpenChat={chat.open}
        onOpenHelp={() => setHelpOpen(true)}
        onNotifyStaff={(taskId) => {
          if (visit.requestFor(taskId)) return;
          visit.openForm(taskId);
        }}
        hideNotifyFor={(taskId) => visit.requestFor(taskId) !== null}
        renderStatusStrip={(taskId) => {
          const request = visit.requestFor(taskId);
          if (!request) return null;
          return (
            <RequestStatusStrip
              request={request}
              // **AI 채팅이 아니라 담당자 채팅을 연다.** 여기가 `chat.open`을
              // 부르고 있어서 담당자가 보낸 말이 사용자에게 닿지 않았다.
              onOpenStaffChat={() => setStaffChatFor(request)}
              onCancel={() => visit.cancel(request.id)}
              // 취소된 요청을 다시 보낸다. 폼을 다시 열어 시간부터 고르게 한다 —
              // 같은 시간으로 자동 재전송하면 그때가 안 되어 취소한 경우 되풀이된다.
              onResend={() => visit.openForm(taskId)}
            />
          );
        }}
      />

      {/* **방문 요청 실패도 여기서 낸다.** 시트에만 그리면 취소·목록 불러오기처럼
          시트가 닫힌 상태에서 난 실패는 아무 데도 안 보인다. 사용자는 취소가 됐는지
          안 됐는지 모른 채 여러 번 누르게 된다 */}
      {server.error || (!visit.formTaskId && visit.error) ? (
        <NoteBox tone="warn" className="absolute inset-x-4 bottom-6">
          {server.error || visit.error}
        </NoteBox>
      ) : null}

      {chatTask ? (
        <ChatPopup
          visible
          taskTitle={chatTask.title}
          messages={chat.messages}
          busy={chat.busy}
          onSend={chat.send}
          onClose={chat.close}
          onClear={chat.clear}
          onOpenHelp={() => {
            chat.close();
            setHelpOpen(true);
          }}
        />
      ) : null}

      {/* **담당자와 주고받는 방.** AI 채팅과 따로 있다 — 저쪽은 제도를 물어보는
          자리이고 여기는 사람과 시간·오시는 길을 맞추는 자리다 (§7.3) */}
      {staffChatFor ? (
        <UserChatSheet request={staffChatFor} onClose={() => setStaffChatFor(null)} />
      ) : null}

      {visitTask ? (
        <VisitRequestSheet
          visible
          userName={session.name}
          purpose={visitTask.title}
          docs={visitTask.docs ?? []}
          answers={session.rawAnswers}
          routeId={visitTask.id}
          onSubmit={visit.submit}
          onClose={visit.closeForm}
          sending={visit.sending}
          error={visit.error}
        />
      ) : null}

      {/* 상한에 닿아도 그냥 막지 않는다. 왜 막혔는지 알려준다 (§7.5). */}
      <FramedModal
        visible={visit.blocked !== null}
        animationType="fade"
        transparent
        onRequestClose={visit.dismissBlocked}
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-8">
          <View className="w-full rounded-2xl bg-white px-5 py-6">
            <Text className="text-body-lg text-ink-strong">
              {visit.blocked ? limitMessage(visit.blocked) : ""}
            </Text>
            <Pressable
              onPress={visit.dismissBlocked}
              accessibilityRole="button"
              accessibilityLabel="알겠어요"
              className="mt-5 items-center rounded-xl bg-brand py-4 active:opacity-90"
            >
              <Text className="text-body-lg font-extrabold text-white">알겠어요</Text>
            </Pressable>
          </View>
        </View>
      </FramedModal>

      <FramedModal
        visible={helpOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setHelpOpen(false)}
      >
        <HelpScreen onClose={() => setHelpOpen(false)} />
      </FramedModal>
    </>
  );
}
