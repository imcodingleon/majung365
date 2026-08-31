// 화면 검증에 쓰는 가짜 서버 응답.
//
// **시각을 고정한다.** "어제"·"8월 26일" 같은 표시는 지금이 언제냐에 따라 답이
// 달라지므로, 실제 시계로 재면 자정을 넘길 때마다 결과가 흔들린다. 브라우저의
// `Date`를 아래 `NOW`로 못 박고, 데이터도 같은 기준으로 만든다.
import type { IntakeTask } from "@/shared/types/intake";
import type { VisitResponse } from "@/shared/types/visitRequest";
import type { ChatRoomSummary } from "@/shared/utils/api";

/** 테스트 안에서 "지금"인 시각. 2026년 8월 31일 월요일 오전 9시다. */
export const NOW = new Date("2026-08-31T09:00:00+09:00");

/** 가입할 때 적은 것으로 치는 생일. 내 정보에 들어가려면 이 값을 그대로 적어야 한다. */
export const BIRTH = "1980-03-15";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
export const later = (ms: number) => new Date(NOW.getTime() + ms).toISOString();

export const TIME = { MIN, HOUR, DAY } as const;

/**
 * 방문 요청 넷. 알림 네 종류가 한 번에 나오도록 짰다.
 *
 * `v-msg`가 이 묶음의 핵심이다 — **요청은 이틀 전에 보냈는데 답은 30분 전에 왔다.**
 * 알림이 "요청을 보낸 때"를 쓰면 이틀 전 묶음으로 내려가 묻힌다.
 */
export function visitsFixture(): VisitResponse[] {
  return [
    {
      id: "v-msg",
      route_id: "R1",
      status: "confirmed",
      preferred_at_1: later(DAY),
      preferred_at_2: null,
      prepared_docs: ["신분증"],
      note: "",
      staff_name: "박지훈 주무관",
      meeting_place: "2층 상담실",
      confirmed_for: later(DAY + 5 * HOUR),
      confirmed_at: ago(40 * MIN),
      created_at: ago(2 * DAY),
      proposed_at: null,
      cancel_reason: "",
      chat_available: true,
      unread: 3,
      last_message: "네, 그때 뵙겠습니다. 신분증만 챙겨 오세요.",
      last_message_at: ago(30 * MIN),
    },
    {
      id: "v-conf",
      route_id: "R3",
      status: "confirmed",
      preferred_at_1: later(2 * DAY),
      preferred_at_2: null,
      prepared_docs: [],
      note: "",
      staff_name: "김서연",
      meeting_place: "1층 접수창구",
      confirmed_for: later(2 * DAY + 2 * HOUR),
      confirmed_at: ago(2 * HOUR),
      created_at: ago(3 * DAY),
      proposed_at: null,
      cancel_reason: "",
      chat_available: true,
      unread: 0,
      last_message: "확인했습니다. 준비물은 따로 없습니다.",
      last_message_at: ago(2 * HOUR),
    },
    {
      id: "v-prop",
      route_id: "R9",
      status: "reschedule_proposed",
      preferred_at_1: later(3 * DAY),
      preferred_at_2: null,
      prepared_docs: [],
      note: "",
      staff_name: "",
      meeting_place: "",
      confirmed_for: null,
      confirmed_at: null,
      created_at: ago(DAY),
      proposed_at: later(4 * DAY),
      cancel_reason: "",
      chat_available: true,
      unread: 0,
      last_message: "",
      last_message_at: null,
    },
    {
      id: "v-cancel",
      route_id: "R12",
      status: "cancelled",
      preferred_at_1: ago(2 * DAY),
      preferred_at_2: null,
      prepared_docs: [],
      note: "",
      staff_name: "",
      meeting_place: "",
      confirmed_for: null,
      confirmed_at: null,
      created_at: ago(4 * DAY),
      proposed_at: null,
      cancel_reason: "그날은 담당자가 자리를 비웁니다.",
      chat_available: false,
      unread: 0,
      last_message: "",
      last_message_at: null,
    },
  ];
}

/** 대화가 남아 있는 방 넷. 오늘·오늘·어제·닷새 전으로 갈라 두었다. */
export function roomsFixture(): ChatRoomSummary[] {
  return [
    { route_id: "R1", preview: "출소증명서는 교정시설에서 받으실 수 있어요.", at: ago(12 * MIN) },
    { route_id: "R3", preview: "긴급지원은 공단 지부에서 신청해요.", at: ago(5 * HOUR) },
    { route_id: "R9", preview: "신분증은 행정복지센터에서 재발급받아요.", at: ago(DAY) },
    { route_id: "R12", preview: "생계급여는 주소지 관할에서 신청합니다.", at: ago(5 * DAY) },
  ];
}

type TaskSeed = {
  id: string;
  label: string;
  tab: string;
  sectionId: string;
  section: string;
  must?: boolean;
  canVisit?: boolean;
};

const TASK_SEEDS: TaskSeed[] = [
  { id: "R1", label: "숙식제공", tab: "숙식", sectionId: "S3", section: "주거", must: true, canVisit: true },
  { id: "R3", label: "기초건강지원", tab: "건강", sectionId: "S5", section: "건강·심리", canVisit: true },
  { id: "R9", label: "신분증", tab: "신분증", sectionId: "S2", section: "신분·행정", must: true, canVisit: true },
  { id: "R12", label: "생계급여", tab: "생계", sectionId: "S1", section: "생계·긴급비용", canVisit: true },
];

function card(seed: TaskSeed) {
  return {
    institution_id: `inst-${seed.id}`,
    name: seed.label,
    summary_easy: `${seed.label}에 대한 안내예요.`,
    docs: ["신분증"],
    deadline: null,
    source_url: "",
    benefit_summary: "",
    eligibility: [],
    steps: [`${seed.label} 첫 번째 단계입니다.`, `${seed.label} 두 번째 단계입니다.`],
    cautions: [],
    options: [
      {
        org: "한국법무보호복지공단",
        where: "관할 지부",
        next_step: `${seed.label}을 신청하세요.`,
        docs: ["신분증"],
        desk_place: "",
        desk_say: "",
        contact_org: "한국법무보호복지공단",
        contact_phone: "1600-0464",
        contact_hours: "평일 오전 9시부터 오후 6시까지",
      },
    ],
    source_urls: [],
    verified_note: "",
  };
}

/** 할 일 넷. 방문 요청·대화방 픽스처와 지원 항목 번호를 맞춰 두었다. */
export function tasksFixture(): { name: string; tasks: IntakeTask[]; completed: string[] } {
  return {
    name: "홍길동",
    tasks: TASK_SEEDS.map((seed) => ({
      route_id: seed.id as IntakeTask["route_id"],
      route_label: seed.label,
      tab_label: seed.tab,
      section_id: seed.sectionId,
      section_label: seed.section,
      blocks_others: Boolean(seed.must),
      can_request_visit: Boolean(seed.canVisit),
      card: card(seed),
    })),
    completed: [],
  };
}
