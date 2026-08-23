// 홈 — 오늘의 할 일 (§5).
//
// 화면들을 조립하는 자리다. 할 일 목록 위에 AI 채팅 팝업(§6.1)·도움 연결(§5.3)·방문 알림(§7)이
// 얹힌다. 팝업을 닫으면 보고 있던 탭이 열린 그 상태로 돌아온다. 페이지 이동이 아니기 때문이다.
//
// **할 일 목록은 서버가 만든다.** 초기 진단 답변을 보내면 지원 항목이 정해져 돌아온다.
// 완료 처리도 서버가 목록을 다시 계산하는 방식이라 기기는 마친 항목만 들고 있으면 된다.
import { useCallback, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Redirect } from "expo-router";

import { useTaskThreads } from "@/features/chat/hooks/useTaskThreads";
import { ChatPopup } from "@/features/chat/views/ChatPopup";
import { HelpScreen } from "@/features/help";
import type { RouteId } from "@/features/tasks/domain/task";
import { toTasks } from "@/features/tasks/domain/fromServer";
import { useServerTasks } from "@/features/tasks/hooks/useServerTasks";
import { TodayScreen } from "@/features/tasks";
import { limitMessage } from "@/features/visit/domain/request";
import { useVisitRequests } from "@/features/visit/hooks/useVisitRequests";
import { RequestStatusStrip } from "@/features/visit/views/RequestStatusStrip";
import { VisitRequestSheet } from "@/features/visit/views/VisitRequestSheet";
import { NoteBox } from "@/shared/components/NoteBox";
import { getSession } from "@/shared/utils/session";

export default function TodayRoute() {
  const session = getSession();
  const server = useServerTasks(
    session?.answers ?? null,
    session?.tasks ? toTasks(session.tasks) : undefined,
  );
  const chat = useTaskThreads();
  const visit = useVisitRequests();
  const [helpOpen, setHelpOpen] = useState(false);
  // 아코디언 열림은 화면 상태다. 아무것도 안 골랐으면 첫 항목이 열린 채로 시작한다 (§5.2).
  const [openId, setOpenId] = useState<RouteId | null>(null);

  const tasks = server.tasks;
  const headId = tasks[0]?.id ?? null;
  const pendingMust = tasks.filter((t) => t.must).map((t) => t.title);

  const toggle = useCallback((id: RouteId) => setOpenId((prev) => (prev === id ? null : id)), []);

  const complete = useCallback(
    (id: RouteId) => {
      // 서버가 목록을 다시 계산해 마친 항목을 뺀다. 그러면 다음 항목이 맨 위로 온다.
      server.complete(id);
      setOpenId(null);
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
          return <RequestStatusStrip request={request} onOpenStaffChat={() => chat.open(taskId)} />;
        }}
      />

      {server.error ? (
        <NoteBox tone="warn" className="absolute inset-x-4 bottom-6">{server.error}</NoteBox>
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
      <Modal
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
      </Modal>

      <Modal
        visible={helpOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setHelpOpen(false)}
      >
        <HelpScreen onClose={() => setHelpOpen(false)} />
      </Modal>
    </>
  );
}
