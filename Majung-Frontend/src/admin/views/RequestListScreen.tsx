// 방문 예정 알림 목록 (§8.1).
//
// **§7.4의 전달 항목만 보인다.** 죄목은 여기 없다. 담당자에게 전달하지 않기로 했고
// 타입에도 자리를 두지 않았다.
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { COLORS } from "@/shared/theme/colors";
import { orgKindLabel, type StaffOrgKind } from "@/shared/types";
import type { VisitStatus } from "@/shared/types/visit";

import { isNew, statusLabel, type StaffRequest } from "../domain/staffRequest";

type Props = {
  requests: readonly StaffRequest[];
  /**
   * 로그인한 담당자. 기관명을 고정값으로 박아 두면 **다른 기관 담당자에게도 공단이라고
   * 적힌 화면이 나간다.** 지금 누가 무엇을 보고 있는지가 화면에 있어야 한다 (§8.2).
   */
  staff: { displayName: string; orgKind: StaffOrgKind; branch: string } | null;
  onOpen: (id: string) => void;
  onSignOut: () => void;
};

const STATUS_TONE: Record<VisitStatus, { bg: string; ink: string }> = {
  sent: { bg: COLORS.sun500, ink: "#ffffff" },
  acknowledged: { bg: COLORS.noteInfo, ink: COLORS.noteInfoInk },
  confirmed: { bg: COLORS.doneBg, ink: COLORS.doneInk },
  reschedule_proposed: { bg: COLORS.noteWarn, ink: COLORS.noteWarnInk },
  completed: { bg: COLORS.line, ink: COLORS.inkSub },
  cancelled: { bg: COLORS.alertSoft, ink: COLORS.alertInk },
};

function StatusBadge({ status }: { status: VisitStatus }) {
  const tone = STATUS_TONE[status];
  return (
    <View className="rounded-full px-3 py-1" style={{ backgroundColor: tone.bg }}>
      <Text className="text-caption font-extrabold" style={{ color: tone.ink }}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}

export function RequestListScreen({ requests, staff, onOpen, onSignOut }: Props) {
  // 아직 손대지 않은 요청을 위로 올린다. 급한 사람의 요청이 아래로 밀리면 안 된다 (§7.5).
  const sorted = [...requests].sort((a, b) => Number(isNew(b.status)) - Number(isNew(a.status)));
  const newCount = requests.filter((r) => isNew(r.status)).length;

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
      <View className="border-b border-line bg-white px-5 py-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-2">
            <Text className="text-caption text-ink-muted" numberOfLines={1}>
              {staff ? `${orgKindLabel(staff.orgKind)} ${staff.branch}` : ""}
            </Text>
            <Text className="mt-1 text-heading font-extrabold text-ink-strong">방문 예정 알림</Text>
            {staff ? (
              <Text className="mt-1 text-caption text-ink-sub">{staff.displayName} 담당자</Text>
            ) : null}
          </View>
          <Pressable
            onPress={onSignOut}
            accessibilityRole="button"
            accessibilityLabel="나가기"
            className="rounded-lg border border-line px-3 py-2 active:opacity-70"
          >
            <Text className="text-caption font-bold text-ink-sub">나가기</Text>
          </Pressable>
        </View>

        {/* 목록은 아직 화면 안의 예시다. 로그인은 서버가 확인하지만 요청 목록 API가
            아직 붙지 않았다 — 그 사실을 화면이 숨기지 않는다 */}
        <View className="mt-3 rounded-lg border border-alert-line bg-alert-soft px-3 py-2">
          <Text className="text-caption font-bold text-alert">
            아래 목록은 예시입니다 · 실제 요청이 아닙니다
          </Text>
        </View>

        {/* 다른 기관 요청은 서버가 걸러 아예 오지 않는다. 화면이 거르는 것이 아니라는
            사실을 담당자가 알아야 목록을 믿을 수 있다 */}
        {staff ? (
          <Text className="mt-2 text-caption text-ink-muted">
            {staff.branch}으로 온 요청만 보입니다.
          </Text>
        ) : null}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-12 pt-4">
        <Text className="mb-4 text-caption text-ink-sub">
          {newCount > 0 ? `아직 확인하지 않은 요청이 ${newCount}건 있습니다.` : "새 요청이 없습니다."}
        </Text>

        {sorted.map((request) => (
          <Pressable
            key={request.id}
            onPress={() => onOpen(request.id)}
            accessibilityRole="button"
            accessibilityLabel={`${request.name} ${request.purpose} 요청 열기`}
            className="mb-3 rounded-2xl border-[1.5px] border-line bg-white px-4 py-4 active:opacity-90"
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-body-lg font-extrabold text-ink-strong">{request.name}</Text>
                <Text className="mt-1 text-body text-ink-body">{request.purpose}</Text>
              </View>
              <StatusBadge status={request.status} />
            </View>

            <View className="mt-3 border-t border-line pt-3">
              <Text className="text-caption text-ink-sub">
                1지망 {request.firstChoice}
              </Text>
              <Text className="text-caption text-ink-sub">
                2지망 {request.secondChoice}
              </Text>
              <Text className="mt-1 text-caption text-ink-muted">{request.receivedAt} 받음</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
