// 본선 개편 홈 — 오늘의 할 일 (§5).
// 예선 5탭 구조가 남아 있는 동안의 임시 경로다. (tabs) 폐기 커밋에서 루트 index로 승격한다.
//
// 화면들을 조립하는 자리다. 할 일 목록 위에 AI 채팅 팝업(§6.1)·도움 연결(§5.3)·방문 알림(§7)이
// 얹힌다. 팝업을 닫으면 보고 있던 탭이 열린 그 상태로 돌아온다. 페이지 이동이 아니기 때문이다.
import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";

import { DEMO_THREAD } from "@/features/chat/domain/demoThread";
import { useTaskThreads } from "@/features/chat/hooks/useTaskThreads";
import { ChatPopup } from "@/features/chat/views/ChatPopup";
import { HelpScreen } from "@/features/help";
import { DEMO_TASKS } from "@/features/tasks/domain/demoTasks";
import { TodayScreen } from "@/features/tasks";
import { limitMessage } from "@/features/visit/domain/request";
import { useVisitRequests } from "@/features/visit/hooks/useVisitRequests";
import { RequestStatusStrip } from "@/features/visit/views/RequestStatusStrip";
import { VisitRequestSheet } from "@/features/visit/views/VisitRequestSheet";

const USER_NAME = "판수";

export default function TodayRoute() {
  const tasks = DEMO_TASKS;
  // 표본 대화는 R9 방에만 넣어 근거 단계 표시를 확인한다. 서버 연결이 붙으면 지운다.
  const chat = useTaskThreads({ R9: [...DEMO_THREAD] });
  const visit = useVisitRequests();
  const [helpOpen, setHelpOpen] = useState(false);

  const chatTask = tasks.find((t) => t.id === chat.openTaskId) ?? null;
  const visitTask = tasks.find((t) => t.id === visit.formTaskId) ?? null;

  return (
    <>
      <TodayScreen
        tasks={tasks}
        userName={USER_NAME}
        onOpenChat={chat.open}
        onOpenHelp={() => setHelpOpen(true)}
        // 이미 보낸 요청이 있으면 알리기 버튼을 감춘다. 상태 스트립이 그 자리를 대신한다.
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
              onOpenStaffChat={() => chat.open(taskId)}
            />
          );
        }}
      />

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
          userName={USER_NAME}
          purpose={visitTask.title}
          docs={visitTask.docs ?? []}
          onSubmit={visit.submit}
          onClose={visit.closeForm}
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
            <Text className="text-base leading-[27px] text-ink-strong">
              {visit.blocked ? limitMessage(visit.blocked) : ""}
            </Text>
            <Pressable
              onPress={visit.dismissBlocked}
              accessibilityRole="button"
              accessibilityLabel="알겠어요"
              className="mt-5 items-center rounded-xl bg-brand py-3.5 active:opacity-90"
            >
              <Text className="text-base font-extrabold text-white">알겠어요</Text>
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
