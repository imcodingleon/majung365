// 시연 촬영용 가짜 데이터 한 벌.
//
// **여기 있는 값은 화면을 찍기 위한 것이며 실제 사용자와 아무 관계가 없다.**
// 이 파일은 `src/app/showcase/preview/[screen].tsx`를 통해서만 실행되고, 그 경로에서만
// 로드된다. 일반 라우트는 이 파일을 부르지 않는다.
//
// 무엇을 가상으로 두고 무엇을 실제로 두는가
//   - **사람에 관한 것은 전부 가상이다** — 이름·생일·출소날짜·주소·전화·담당자 이름.
//     출소자 대상 서비스에서 진짜처럼 보이는 개인정보를 화면에 올리는 일은 그 자체가
//     사고다. 시연 이미지가 PPT로 나가고 그 PPT가 어디까지 도는지 알 수 없다
//   - **기관 이름과 대표번호는 실제 값이다** (`route-contacts.md` · `hotlines.py`).
//     이것은 개인정보가 아니라 이 서비스가 안내하는 대상 자체이고, 가상으로 바꾸면
//     화면이 거짓이 된다. 심사위원이 "이 번호가 진짜인가"를 물었을 때 진짜여야 한다
//
// 라벨·정렬·탭 이름은 백엔드 정본(`app/domains/shared/routes.py`)을 그대로 옮겼다.
// 지어내면 시연 화면만 다른 말을 쓰게 된다.
import type { MeResponse, RestoreResponse } from "@/shared/types/account";
import type {
  Center,
  ChatRole,
  DistrictOffice,
  Institution,
  StoredChatTurn,
} from "@/shared/types/api";
import type { IntakeCard, IntakeCardOption, IntakeTask } from "@/shared/types/intake";
import type { VisitResponse } from "@/shared/types/visitRequest";
import type { ChatRoomSummary } from "@/shared/utils/api";

// ── 기준 시각 ─────────────────────────────────────────────────────────
//
// **찍는 날에 맞춰 날짜가 함께 움직인다.** 고정 날짜를 박아 두면 다음 달에 다시 찍을 때
// 화면에 지난 날짜가 뜨고, "며칠 전"으로 세는 자리가 전부 어긋난다.

const NOW = new Date();

/** 오늘로부터 며칠 전·후의 ISO 시각. 음수가 과거다. */
function at(days: number, hour = 10, minute = 0): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** YYYY-MM-DD. 생일·출소날짜처럼 시각이 없는 값에 쓴다. */
function day(days: number): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** 출소한 지 48일. 초기 지원의 기한들이 아직 살아 있으면서 정착이 시작된 시점이다. */
const DAYS_SINCE_RELEASE = 48;

// ── 사람 ──────────────────────────────────────────────────────────────

/** 가상의 사용자. **실존 인물이 아니다.** */
export const USER = {
  name: "정하윤",
  birthDate: "1992-03-11",
  releaseDate: day(-DAYS_SINCE_RELEASE),
} as const;

/** 가상의 사는 곳. 안양 호계1동은 기관이 고루 있어 목록이 자연스럽게 찬다. */
export const PLACE = {
  sido: "경기도",
  district: "안양시 동안구",
  dong: "호계1동",
  lat: 37.3803,
  lng: 126.9541,
} as const;

// ── 할 일 (GET /api/tasks · POST /api/signup) ────────────────────────

/** 신청 경로 하나를 만든다. 빈 자리를 남기지 않으려고 아홉 칸을 모두 채운다. */
function option(o: IntakeCardOption): IntakeCardOption {
  return o;
}

/** 확인 날짜 문구. 서버가 완성된 문장으로 주는 값이라 형태를 그대로 흉내 낸다. */
const VERIFIED = `이 안내는 마중365가 ${new Date(NOW).getFullYear()}년 ${
  NOW.getMonth() + 1
}월 ${NOW.getDate()}일에 확인했어요.`;

function card(c: Omit<IntakeCard, "verified_note">): IntakeCard {
  return { ...c, verified_note: VERIFIED };
}

/**
 * 할 일 7개.
 *
 * **순서는 백엔드의 `ROUTE_ORDER`를 따른다** — R13·R9가 선행조건이라 앞에 오고, 그
 * 뒤로 생계·주거·취업·심리가 온다. 화면이 다시 정렬하지 않으므로 여기서 틀리면
 * 시연 화면의 순서가 실제와 달라진다.
 */
export const TASKS: IntakeTask[] = [
  {
    route_id: "R13",
    route_label: "수용·출소증명서",
    tab_label: "증명서",
    section_id: "S6",
    section_label: "기타·권리구제",
    // 이것이 없으면 뒤가 전부 막힌다.
    blocks_others: true,
    // 교정시설은 방문 요청을 받는 기관이 아니다.
    can_request_visit: false,
    card: card({
      institution_id: "misc-release-certificate",
      name: "수용·출소증명서 발급",
      summary_easy:
        "출소한 사실을 서류로 증명하는 종이예요. 다른 신청을 할 때 거의 다 이 종이를 함께 냅니다.",
      docs: ["신분 확인 서류"],
      deadline: null,
      source_url: "https://www.kics.go.kr/",
      benefit_summary: "발급 수수료가 없어요. 신청한 날 바로 받을 수 있습니다.",
      eligibility: ["출소한 본인", "본인이 못 가면 위임장을 쓴 가족"],
      steps: [
        "형사사법포털에서 온라인으로 신청합니다",
        "출소한 교정시설 민원실에 직접 가서 받아도 됩니다",
        "받은 증명서는 원본을 보관하고 필요할 때마다 사본을 냅니다",
      ],
      cautions: [
        "온라인 신청에는 본인 인증이 필요해서, 신분증이 아직 없으면 민원실 쪽이 빠릅니다",
      ],
      options: [
        option({
          org: "형사사법포털",
          where: "형사사법포털(kics.go.kr) 증명서 발급",
          next_step: "본인 인증을 하고 '수용증명서'를 신청해 주세요.",
          docs: ["공동인증서 또는 간편인증"],
          desk_place: "출소한 교정시설 민원실",
          desk_say: "출소증명서 발급받으러 왔습니다.",
          contact_org: "교정민원콜센터",
          contact_phone: "1363",
          contact_hours: "",
        }),
      ],
      source_urls: ["https://www.kics.go.kr/", "https://www.corrections.go.kr/"],
    }),
    starter_questions: [
      "어디서 받아요?",
      "돈이 드나요?",
      "신분증 대신 쓸 수 있어요?",
      "출소증명서를 다시 받아요?",
    ],
  },
  {
    route_id: "R9",
    route_label: "신분증",
    tab_label: "신분증",
    section_id: "S3",
    section_label: "신분·행정",
    blocks_others: true,
    can_request_visit: true,
    card: card({
      institution_id: "identity-id-card-reissue",
      name: "주민등록증 재발급",
      summary_easy:
        "주민등록증을 다시 만드는 일이에요. 통장을 만들거나 일자리를 구할 때 가장 먼저 필요합니다.",
      docs: ["사진 1장 (3.5cm x 4.5cm)", "수용증명서 또는 신분 확인 서류(있는 대로)"],
      deadline: null,
      source_url: "https://www.gov.kr/",
      benefit_summary:
        "수수료는 5,000원이고, 신청한 자리에서 임시 신분증을 받아 그날부터 쓸 수 있어요.",
      eligibility: ["주민등록이 살아 있는 본인", "말소된 경우에는 재등록을 먼저 합니다"],
      steps: [
        "사진관에서 규격 사진을 찍습니다",
        "가까운 주민센터 창구에 사진과 서류를 냅니다",
        "임시 신분증을 그 자리에서 받습니다",
        "본 신분증은 2~3주 뒤에 같은 창구에서 받습니다",
      ],
      cautions: [
        "주민등록이 말소되어 있으면 재등록이 먼저입니다. 창구에서 함께 처리해 줍니다",
        "수수료를 내기 어려우면 창구에서 면제 여부를 물어봐 주세요",
      ],
      options: [
        option({
          org: "주민센터",
          where: "사는 곳 주민센터",
          next_step: "사진 1장을 챙겨서 창구에 가 주세요.",
          docs: ["사진 1장", "수용증명서"],
          desk_place: "호계1동 행정복지센터 민원창구",
          desk_say: "주민등록증 재발급 신청하러 왔습니다.",
          contact_org: "정부민원안내콜센터",
          contact_phone: "국번없이 110",
          contact_hours: "",
        }),
      ],
      source_urls: ["https://www.gov.kr/", "https://www.mois.go.kr/"],
    }),
    starter_questions: [
      "얼마나 걸려요?",
      "돈이 드나요?",
      "사진이 꼭 필요해요?",
      "그동안 쓸 것이 있나요?",
    ],
  },
  {
    route_id: "R2",
    route_label: "공단 긴급지원",
    tab_label: "지원금",
    section_id: "S2",
    section_label: "생계·긴급비용",
    blocks_others: false,
    can_request_visit: true,
    card: card({
      institution_id: "welfare-emergency-support",
      name: "긴급 생활지원",
      summary_easy:
        "당장 먹고 자는 데 쓸 돈을 급하게 도와주는 제도예요. 공단과 주민센터 두 곳에서 각각 받을 수 있습니다.",
      docs: ["신분 확인 서류", "출소 사실을 확인할 수 있는 서류", "통장 사본"],
      deadline: "출소 후 6개월 이내에 신청해 주세요.",
      source_url: "https://www.koreha.or.kr/",
      benefit_summary:
        "공단 긴급지원은 최대 100만원, 정부 긴급복지 생계지원은 1인 가구 기준 월 73만원을 최대 6개월까지 받습니다.",
      eligibility: [
        "출소 후 6개월이 지나지 않은 사람",
        "당장 생계를 잇기 어려운 사정이 있는 사람",
        "정부 긴급복지는 소득·재산 기준을 함께 봅니다",
      ],
      steps: [
        "공단 지부에 전화해서 상담 날짜를 잡습니다",
        "지부에 가서 긴급지원을 신청합니다",
        "주민센터에서 정부 긴급복지도 함께 신청합니다",
        "결과는 보통 1~2주 안에 문자로 옵니다",
      ],
      cautions: [
        "두 제도를 같은 달에 함께 받기 어려운 경우가 있어요. 상담에서 어느 쪽이 유리한지 물어봐 주세요",
        "통장이 아직 없으면 먼저 만들어야 지원금을 받을 수 있습니다",
      ],
      options: [
        option({
          org: "한국법무보호복지공단",
          where: "경기지부 긴급지원 창구",
          next_step: "지부에 전화해서 상담 날짜를 먼저 잡아 주세요.",
          docs: ["신분증", "출소확인서"],
          desk_place: "한국법무보호복지공단 경기지부",
          desk_say: "긴급지원 상담 예약하고 왔습니다.",
          contact_org: "한국법무보호복지공단",
          contact_phone: "1670-7004",
          contact_hours: "",
        }),
        option({
          org: "정부 긴급복지",
          where: "사는 곳 주민센터 복지창구",
          next_step: "주민센터 복지창구에서 긴급복지 생계지원을 신청해 주세요.",
          docs: ["신분증", "통장 사본"],
          desk_place: "호계1동 행정복지센터 복지창구",
          desk_say: "긴급복지 생계지원 신청하러 왔습니다.",
          contact_org: "보건복지상담센터",
          contact_phone: "129",
          contact_hours: "",
        }),
      ],
      source_urls: [
        "https://www.koreha.or.kr/",
        "https://www.bokjiro.go.kr/",
        "https://www.mohw.go.kr/",
      ],
    }),
    starter_questions: [
      "얼마나 받을 수 있어요?",
      "긴급지원은 어디에 신청해요?",
      "무슨 서류가 필요해요?",
      "긴급지원은 언제 나와요?",
    ],
  },
  {
    route_id: "R12",
    route_label: "생계급여",
    tab_label: "생계급여",
    section_id: "S2",
    section_label: "생계·긴급비용",
    blocks_others: false,
    can_request_visit: true,
    card: card({
      institution_id: "welfare-basic-livelihood",
      name: "기초생활 생계급여",
      summary_easy:
        "매달 정해진 생활비를 받는 제도예요. 긴급지원이 급한 불을 끄는 것이라면 이쪽은 자리를 잡을 때까지 이어집니다.",
      docs: ["신분 확인 서류", "통장 사본", "임대차계약서 (있으면)"],
      deadline: null,
      source_url: "https://www.bokjiro.go.kr/",
      benefit_summary:
        "1인 가구 기준 월 76만원 안쪽에서 소득을 뺀 만큼 받습니다. 매달 20일 전후로 통장에 들어옵니다.",
      eligibility: [
        "소득이 기준 중위소득 32% 아래인 가구",
        "부양의무자 기준은 2021년에 대부분 없어졌습니다",
      ],
      steps: [
        "주민센터 복지창구에서 신청서를 씁니다",
        "소득·재산 조사가 진행됩니다 (보통 30일)",
        "결정 통지를 받고 다음 달부터 받습니다",
      ],
      cautions: [
        "조사가 한 달쯤 걸려서, 그동안 쓸 돈은 긴급지원으로 먼저 메우는 편이 좋습니다",
        "주소가 정리되어 있어야 신청이 됩니다",
      ],
      options: [
        option({
          org: "주민센터",
          where: "사는 곳 주민센터 복지창구",
          next_step: "주민센터 복지창구에서 생계급여를 신청해 주세요.",
          docs: ["신분증", "통장 사본"],
          desk_place: "호계1동 행정복지센터 복지창구",
          desk_say: "생계급여 신청하러 왔습니다.",
          contact_org: "보건복지상담센터",
          contact_phone: "129",
          contact_hours: "",
        }),
      ],
      source_urls: ["https://www.bokjiro.go.kr/", "https://www.mohw.go.kr/"],
    }),
    starter_questions: [
      "생계급여를 받을 수 있어요?",
      "얼마나 받을 수 있어요?",
      "언제부터 나와요?",
      "생계급여는 어디에 신청해요?",
    ],
  },
  {
    route_id: "R1",
    route_label: "숙식제공",
    tab_label: "거처",
    section_id: "S1",
    section_label: "주거",
    blocks_others: false,
    can_request_visit: true,
    card: card({
      institution_id: "housing-shelter-support",
      name: "생활관 숙식제공",
      summary_easy:
        "공단 생활관에서 잠자리와 세 끼를 받는 제도예요. 방값도 밥값도 들지 않습니다.",
      docs: ["신분 확인 서류", "출소 사실을 확인할 수 있는 서류"],
      deadline: null,
      source_url: "https://www.koreha.or.kr/",
      benefit_summary: "기본 6개월이고, 사정에 따라 최대 2년까지 이어서 지낼 수 있어요.",
      eligibility: [
        "출소 후 지낼 곳이 마땅치 않은 사람",
        "생활관 규칙(금주·귀가시간)을 지킬 수 있는 사람",
      ],
      steps: [
        "지부에 전화해서 빈자리가 있는지 확인합니다",
        "지부에서 상담을 받고 입소를 신청합니다",
        "입소가 정해지면 짐을 챙겨 들어갑니다",
      ],
      cautions: [
        "생활관마다 빈자리가 다릅니다. 한 곳이 차 있으면 가까운 다른 지부를 함께 물어봐 주세요",
        "술은 규칙으로 금지되어 있습니다",
      ],
      options: [
        option({
          org: "한국법무보호복지공단",
          where: "경기지부 생활관",
          next_step: "지부에 전화해서 빈자리를 먼저 물어봐 주세요.",
          docs: ["신분증", "출소확인서", "세면도구"],
          desk_place: "한국법무보호복지공단 경기지부",
          desk_say: "생활관 입소 상담받으러 왔습니다.",
          contact_org: "한국법무보호복지공단",
          contact_phone: "1670-7004",
          contact_hours: "",
        }),
      ],
      source_urls: ["https://www.koreha.or.kr/"],
    }),
    starter_questions: [
      "어디서 지낼 수 있어요?",
      "얼마나 지낼 수 있어요?",
      "돈을 내야 하나요?",
      "생활관에 뭘 챙겨 가요?",
    ],
  },
  {
    route_id: "R6",
    route_label: "취업·허그일자리",
    tab_label: "일자리",
    section_id: "S4",
    section_label: "취업·직업",
    blocks_others: false,
    can_request_visit: true,
    card: card({
      institution_id: "employment-hug-job",
      name: "허그일자리 지원",
      summary_easy:
        "상담부터 취업까지 한 담당자가 이어서 봐 주는 제도예요. 일자리를 소개하고 훈련비도 함께 지원합니다.",
      docs: ["신분 확인 서류", "이력서 (없으면 지부에서 같이 씁니다)"],
      deadline: null,
      source_url: "https://www.koreha.or.kr/",
      benefit_summary:
        "단계별로 참여수당이 나오고, 취업이 정해지면 취업성공수당을 최대 100만원까지 받습니다.",
      eligibility: ["일할 뜻이 있는 출소자", "나이 제한이 없습니다"],
      steps: [
        "지부에서 첫 상담을 받습니다",
        "적성검사와 직업훈련 과정을 고릅니다",
        "훈련을 마치면 협력업체를 연결받습니다",
        "취업 후에도 6개월 동안 사후관리를 받습니다",
      ],
      cautions: [
        "수용 사유를 회사에 반드시 알려야 하는 것은 아닙니다. 상담에서 어디까지 말할지 함께 정합니다",
        "훈련 과정은 분기마다 열려서 시작 날짜가 정해져 있습니다",
      ],
      options: [
        option({
          org: "한국법무보호복지공단",
          where: "경기지부 취업지원팀",
          next_step: "지부 취업지원팀에 상담을 신청해 주세요.",
          docs: ["신분증"],
          desk_place: "한국법무보호복지공단 경기지부 취업지원팀",
          desk_say: "허그일자리 상담받으러 왔습니다.",
          contact_org: "한국법무보호복지공단",
          contact_phone: "1670-7004",
          contact_hours: "",
        }),
        option({
          org: "국민취업지원제도",
          where: "가까운 고용센터",
          next_step: "고용센터에서 국민취업지원제도도 함께 신청할 수 있어요.",
          docs: ["신분증", "통장 사본"],
          desk_place: "안양고용센터",
          desk_say: "국민취업지원제도 신청하러 왔습니다.",
          contact_org: "고용노동부 고객상담센터",
          contact_phone: "국번없이 1350",
          contact_hours: "",
        }),
      ],
      source_urls: ["https://www.koreha.or.kr/", "https://www.work24.go.kr/"],
    }),
    starter_questions: [
      "어떤 일을 소개해 주나요?",
      "직업훈련도 받을 수 있어요?",
      "수용 사유를 말해야 하나요?",
      "상담부터 받을 수 있어요?",
    ],
  },
  {
    route_id: "R8",
    route_label: "심리상담",
    tab_label: "마음상담",
    section_id: "S5",
    section_label: "건강·심리",
    blocks_others: false,
    can_request_visit: true,
    card: card({
      institution_id: "health-counseling",
      name: "심리상담 지원",
      summary_easy:
        "마음이 힘들 때 이야기를 나누는 자리예요. 상담 내용은 밖으로 나가지 않습니다.",
      docs: [],
      deadline: null,
      source_url: "https://www.koreha.or.kr/",
      benefit_summary: "공단 허그상담소는 상담료가 없고, 정신건강복지센터도 무료로 이용합니다.",
      eligibility: ["출소자 본인", "따로 자격 조건이 없습니다"],
      steps: [
        "허그상담소나 정신건강복지센터에 전화해서 날짜를 잡습니다",
        "첫 상담에서 어떤 이야기를 나눌지 함께 정합니다",
        "보통 주 1회씩 이어 갑니다",
      ],
      cautions: [
        "상담 내용은 본인 동의 없이 어디에도 전해지지 않습니다",
        "밤에 힘들 때는 1577-0199로 바로 전화할 수 있어요",
      ],
      options: [
        option({
          org: "허그상담소",
          where: "공단 허그상담소",
          next_step: "허그상담소에 전화해서 상담 날짜를 잡아 주세요.",
          docs: [],
          desk_place: "한국법무보호복지공단 허그상담소",
          desk_say: "심리상담 받고 싶어서 왔습니다.",
          contact_org: "한국법무보호복지공단",
          contact_phone: "1670-7004",
          contact_hours: "",
        }),
        option({
          org: "정신건강복지센터",
          where: "안양시 정신건강복지센터",
          next_step: "가까운 정신건강복지센터에서도 무료로 상담받을 수 있어요.",
          docs: [],
          desk_place: "안양시 정신건강복지센터",
          desk_say: "상담 예약하러 왔습니다.",
          contact_org: "정신건강 위기상담전화",
          contact_phone: "1577-0199",
          contact_hours: "",
        }),
      ],
      source_urls: ["https://www.koreha.or.kr/", "https://www.mentalhealth.go.kr/"],
    }),
    starter_questions: [
      "돈이 드나요?",
      "어디로 가면 돼요?",
      "마음 상담은 어떻게 해요?",
      "비밀이 지켜지나요?",
    ],
  },
];

/**
 * `GET /api/tasks` 응답.
 *
 * **마친 항목을 하나만 둔다.** 아코디언은 완료를 누르면 다음 탭이 열리는 구조라(§5.2),
 * 하나가 끝나 있어야 "진행 중인 사람"으로 보인다. 전부 비면 막 가입한 화면이 되고,
 * 여럿이 끝나 있으면 남은 할 일이 적어 보여 목록이 헐거워진다.
 */
export const RESTORE: RestoreResponse = {
  name: USER.name,
  tasks: TASKS,
  completed: ["R13"],
};

// ── 내 정보 (GET /api/me) ────────────────────────────────────────────

export const ME: MeResponse = {
  user_id: "showcase-user",
  name: USER.name,
  birth_date: USER.birthDate,
  release_date: USER.releaseDate,
  days_since_release: DAYS_SINCE_RELEASE,
  // 참으로 두어야 "지울 수 있어요" 자리가 화면에 나온다 (§2.5).
  has_crime_category: true,
  place: {
    sido: PLACE.sido,
    district: PLACE.district,
    dong: PLACE.dong,
    lat: PLACE.lat,
    lng: PLACE.lng,
  },
};

// ── 방문 요청 (GET /api/visits) ──────────────────────────────────────
//
// **알림 화면이 이 목록에서 만들어진다** (§7.1 · `features/alerts/domain/alert.ts`).
// 서버에 알림을 따로 쌓지 않기 때문이다. 그래서 상태를 고루 섞어야 알림 탭이 찬다.
//   confirmed 2 · sent 1 · acknowledged 1 · reschedule_proposed 1 · completed 1
// `unread`를 둘에 넣어 하단 메뉴바의 배지와 상담 탭의 안 읽음 표시가 켜진다.

export const VISITS: VisitResponse[] = [
  {
    id: "v-2026-0831-a",
    route_id: "R2",
    status: "confirmed",
    preferred_at_1: at(2, 10, 0),
    preferred_at_2: null,
    prepared_docs: ["신분증", "출소확인서", "통장 사본"],
    note: "긴급지원 상담 먼저 받고 싶습니다.",
    staff_name: "윤서진 주무관",
    meeting_place: "한국법무보호복지공단 경기지부 2층 상담실",
    confirmed_for: at(2, 10, 0),
    confirmed_at: at(-1, 15, 20),
    created_at: at(-3, 9, 40),
    proposed_at: null,
    cancel_reason: "",
    chat_available: true,
    unread: 2,
    last_message: "네, 통장 사본은 창구에서 복사해 드릴 수 있어요.",
    last_message_at: at(0, 9, 12),
  },
  {
    id: "v-2026-0831-b",
    route_id: "R6",
    status: "confirmed",
    preferred_at_1: at(4, 14, 0),
    preferred_at_2: null,
    prepared_docs: ["신분증"],
    note: "",
    staff_name: "한도경 상담사",
    meeting_place: "한국법무보호복지공단 경기지부 취업지원팀",
    confirmed_for: at(4, 14, 0),
    confirmed_at: at(-1, 11, 5),
    created_at: at(-4, 16, 10),
    proposed_at: null,
    cancel_reason: "",
    chat_available: true,
    unread: 1,
    last_message: "이력서는 안 쓰셔도 됩니다. 오셔서 같이 쓰면 돼요.",
    last_message_at: at(-1, 11, 8),
  },
  {
    id: "v-2026-0831-c",
    route_id: "R1",
    status: "reschedule_proposed",
    preferred_at_1: at(1, 9, 0),
    preferred_at_2: null,
    prepared_docs: ["신분증", "출소확인서"],
    note: "생활관 빈자리 있는지 먼저 알고 싶습니다.",
    staff_name: "",
    meeting_place: "",
    confirmed_for: null,
    confirmed_at: null,
    created_at: at(-2, 13, 30),
    proposed_at: at(3, 11, 0),
    cancel_reason: "",
    chat_available: true,
    unread: 0,
    last_message: "",
    last_message_at: null,
  },
  {
    id: "v-2026-0831-d",
    route_id: "R9",
    status: "acknowledged",
    preferred_at_1: at(5, 11, 0),
    preferred_at_2: null,
    prepared_docs: ["사진 1장", "수용증명서"],
    note: "",
    staff_name: "",
    meeting_place: "",
    confirmed_for: null,
    confirmed_at: null,
    created_at: at(-1, 10, 15),
    proposed_at: null,
    cancel_reason: "",
    chat_available: true,
    unread: 0,
    last_message: "",
    last_message_at: null,
  },
  {
    id: "v-2026-0831-e",
    route_id: "R12",
    status: "sent",
    preferred_at_1: at(6, 15, 0),
    preferred_at_2: null,
    prepared_docs: ["신분증", "통장 사본"],
    note: "생계급여 조사가 얼마나 걸리는지 여쭙고 싶습니다.",
    staff_name: "",
    meeting_place: "",
    confirmed_for: null,
    confirmed_at: null,
    created_at: at(0, 8, 50),
    proposed_at: null,
    cancel_reason: "",
    chat_available: false,
    unread: 0,
    last_message: "",
    last_message_at: null,
  },
  {
    id: "v-2026-0831-f",
    route_id: "R8",
    status: "completed",
    preferred_at_1: at(-6, 14, 0),
    preferred_at_2: null,
    prepared_docs: [],
    note: "",
    staff_name: "배은수 상담사",
    meeting_place: "한국법무보호복지공단 허그상담소",
    confirmed_for: at(-6, 14, 0),
    confirmed_at: at(-8, 10, 0),
    created_at: at(-9, 17, 25),
    proposed_at: null,
    cancel_reason: "",
    chat_available: true,
    unread: 0,
    last_message: "다음 주 같은 시간에 뵐게요.",
    last_message_at: at(-6, 15, 40),
  },
];

// ── 대화 (GET /api/chat-rooms · GET /api/chat/{route_id}) ────────────

export const CHAT_ROOMS: ChatRoomSummary[] = [
  {
    route_id: "R9",
    preview: "임시 신분증은 신청한 그 자리에서 받으실 수 있어요.",
    at: at(0, 9, 30),
  },
  {
    route_id: "R2",
    preview: "긴급지원과 긴급복지는 신청하는 곳이 달라요.",
    at: at(-1, 20, 12),
  },
  {
    route_id: "R1",
    preview: "생활관은 방값도 밥값도 들지 않아요.",
    at: at(-3, 11, 45),
  },
  {
    route_id: "R6",
    preview: "수용 사유를 회사에 꼭 말해야 하는 것은 아니에요.",
    at: at(-5, 19, 3),
  },
];

/** 말 한 줄을 만든다. 여섯 인자를 매번 적으면 대본이 안 읽힌다. */
function turn(role: ChatRole, content: string, days: number, hour: number, minute: number,
  suggestions?: string[]): StoredChatTurn {
  return suggestions
    ? { role, content, at: at(days, hour, minute), suggestions }
    : { role, content, at: at(days, hour, minute) };
}

/**
 * 방마다 남아 있는 대화.
 *
 * **6~8턴씩 채운다.** 두세 줄만 있으면 화면이 "막 시작한 대화"로 보이고, 상담 기능이
 * 실제로 쓰이고 있다는 인상이 나오지 않는다.
 */
export const CHAT_HISTORY: Record<string, StoredChatTurn[]> = {
  R9: [
    turn("user", "신분증이 없는데 통장부터 만들 수 있나요?", -2, 20, 10),
    turn(
      "assistant",
      "통장을 만들 때는 신분증이 꼭 필요해요. 그래서 신분증을 먼저 받는 것이 순서입니다.\n\n주민센터에서 주민등록증을 신청하면 그 자리에서 임시 신분증을 받을 수 있어요. 그 임시 신분증으로 은행에 가시면 됩니다.",
      -2,
      20,
      11,
    ),
    turn("user", "사진은 어디서 찍어요?", -2, 20, 15),
    turn(
      "assistant",
      "동네 사진관에서 '주민등록증용'이라고 말씀하시면 규격에 맞게 찍어 줘요. 보통 1만원 안쪽이고 10분이면 나옵니다.\n\n주민센터 안이나 근처에 즉석 사진기가 있는 곳도 많아요.",
      -2,
      20,
      16,
    ),
    turn("user", "수수료가 있나요?", 0, 9, 25),
    turn(
      "assistant",
      "주민등록증 재발급 수수료는 5,000원이에요.\n\n내기 어려운 사정이 있으시면 창구에서 말씀해 주세요. 감면되는 경우가 있어서 담당자가 확인해 드립니다.\n\n임시 신분증은 신청한 그 자리에서 받으실 수 있어요.",
      0,
      9,
      30,
      ["임시 신분증으로 뭘 할 수 있어요?", "본 신분증은 언제 나와요?", "주소가 말소됐으면 어떡해요?"],
    ),
  ],
  R2: [
    turn("user", "당장 쓸 돈이 없는데 어디에 물어봐야 하나요?", -1, 19, 40),
    turn(
      "assistant",
      "두 곳에서 각각 도와드릴 수 있어요.\n\n하나는 한국법무보호복지공단의 긴급지원이고, 다른 하나는 주민센터에서 신청하는 정부 긴급복지예요. 두 제도는 신청하는 곳도 심사하는 곳도 다릅니다.",
      -1,
      19,
      41,
    ),
    turn("user", "얼마나 받을 수 있어요?", -1, 19, 50),
    turn(
      "assistant",
      "공단 긴급지원은 사정에 따라 최대 100만원까지예요.\n\n정부 긴급복지 생계지원은 1인 가구 기준으로 월 73만원 정도를 최대 6개월까지 받습니다.",
      -1,
      19,
      52,
    ),
    turn("user", "둘 다 신청해도 되나요?", -1, 20, 5),
    turn(
      "assistant",
      "둘 다 신청하실 수 있어요. 다만 같은 달에 겹쳐서 받기 어려운 경우가 있습니다.\n\n어느 쪽을 먼저 받는 것이 나은지는 소득과 재산에 따라 갈려요. 지부 상담에서 그 이야기를 함께 하시면 됩니다.\n\n긴급지원과 긴급복지는 신청하는 곳이 달라요.",
      -1,
      20,
      12,
      ["지부에 언제 가면 돼요?", "통장이 없어도 신청되나요?", "결과는 언제 나와요?"],
    ),
  ],
  R1: [
    turn("user", "지낼 곳이 마땅치 않은데 어떻게 하나요?", -3, 11, 20),
    turn(
      "assistant",
      "공단 생활관에서 지내실 수 있어요. 잠자리와 세 끼 식사가 함께 제공됩니다.\n\n기본 6개월이고, 사정에 따라 최대 2년까지 이어서 지낼 수 있어요.",
      -3,
      11,
      22,
    ),
    turn("user", "돈을 내야 하나요?", -3, 11, 30),
    turn(
      "assistant",
      "방값도 밥값도 들지 않아요. 그래서 자리를 잡을 때까지 생활비를 모으실 수 있습니다.",
      -3,
      11,
      31,
    ),
    turn("user", "뭘 챙겨 가야 해요?", -3, 11, 40),
    turn(
      "assistant",
      "세면도구와 갈아입을 옷 정도면 됩니다. 이불과 생활용품은 생활관에 있어요.\n\n신분증과 출소확인서는 입소 절차에 필요하니 꼭 챙겨 주세요.\n\n생활관은 방값도 밥값도 들지 않아요.",
      -3,
      11,
      45,
      ["빈자리가 있는지 어떻게 알아요?", "생활관 규칙이 어떻게 되나요?", "몇 시까지 들어가야 해요?"],
    ),
  ],
  R6: [
    turn("user", "일자리를 구하고 싶은데 어디서부터 해야 하나요?", -5, 18, 30),
    turn(
      "assistant",
      "공단의 허그일자리 지원부터 상담받아 보시면 좋아요. 상담부터 취업까지 한 담당자가 이어서 봐 주는 제도입니다.\n\n적성에 맞는 직업훈련을 고르고, 훈련을 마치면 협력업체를 연결받습니다.",
      -5,
      18,
      32,
    ),
    turn("user", "훈련받는 동안 생활비는 어떻게 해요?", -5, 18, 45),
    turn(
      "assistant",
      "단계마다 참여수당이 나와요. 취업이 정해지면 취업성공수당을 최대 100만원까지 따로 받습니다.\n\n그것만으로 모자라면 긴급지원이나 생계급여를 함께 신청하는 길도 있어요.",
      -5,
      18,
      47,
    ),
    turn("user", "회사에 제 사정을 말해야 하나요?", -5, 18, 58),
    turn(
      "assistant",
      "반드시 말해야 하는 것은 아니에요.\n\n협력업체 가운데는 사정을 알고도 받아 주는 곳이 있고, 굳이 묻지 않는 곳도 있습니다. 어디까지 이야기할지는 상담에서 담당자와 함께 정하시면 돼요.\n\n수용 사유를 회사에 꼭 말해야 하는 것은 아니에요.",
      -5,
      19,
      3,
      ["어떤 훈련 과정이 있어요?", "훈련은 얼마나 걸려요?", "상담은 어디서 받아요?"],
    ),
  ],
};

// ── 기관 (GET /api/centers · /api/institutions · /api/district-offices) ──

/** 지도에 찍을 기관 8곳. 안양·군포 실제 좌표대에 맞춰 흩어 놓았다. */
export const CENTERS: Center[] = [
  {
    id: "c-koreha-gyeonggi",
    category: "법무보호공단",
    name: "한국법무보호복지공단 경기지부",
    address: "경기도 수원시 팔달구 매산로 89",
    phone: "1670-7004",
    hours: "평일 09:00~18:00",
    lat: 37.2662,
    lng: 127.0004,
    tags: ["숙식제공", "긴급지원", "취업지원"],
  },
  {
    id: "c-koreha-hug",
    category: "법무보호공단",
    name: "한국법무보호복지공단 허그상담소",
    address: "경기도 수원시 팔달구 매산로 89 3층",
    phone: "1670-7004",
    hours: "평일 09:00~18:00",
    lat: 37.2664,
    lng: 127.0011,
    tags: ["심리상담"],
  },
  {
    id: "c-dong-hogye1",
    category: "주민센터",
    name: "호계1동 행정복지센터",
    address: "경기도 안양시 동안구 흥안대로 427",
    phone: "031-8045-6640",
    hours: "평일 09:00~18:00",
    lat: 37.3805,
    lng: 126.9538,
    tags: ["신분증", "전입신고", "복지상담"],
  },
  {
    id: "c-dong-hogye3",
    category: "주민센터",
    name: "호계3동 행정복지센터",
    address: "경기도 안양시 동안구 경수대로 590",
    phone: "031-8045-6680",
    hours: "평일 09:00~18:00",
    lat: 37.3719,
    lng: 126.9483,
    tags: ["신분증", "복지상담"],
  },
  {
    id: "c-dong-burim",
    category: "주민센터",
    name: "부림동 행정복지센터",
    address: "경기도 안양시 동안구 부림로 168",
    phone: "031-8045-6520",
    hours: "평일 09:00~18:00",
    lat: 37.3921,
    lng: 126.9506,
    tags: ["신분증", "복지상담"],
  },
  {
    id: "c-employment-anyang",
    category: "고용센터",
    name: "안양고용센터",
    address: "경기도 안양시 동안구 시민대로 230",
    phone: "국번없이 1350",
    hours: "평일 09:00~18:00",
    lat: 37.3947,
    lng: 126.9563,
    tags: ["국민취업지원제도", "실업급여"],
  },
  {
    id: "c-mental-anyang",
    category: "정신건강복지센터",
    name: "안양시 정신건강복지센터",
    address: "경기도 안양시 만안구 안양로 293",
    phone: "1577-0199",
    hours: "평일 09:00~18:00",
    lat: 37.4013,
    lng: 126.9224,
    tags: ["심리상담", "위기상담"],
  },
  {
    id: "c-dong-gunpo",
    category: "주민센터",
    name: "군포1동 행정복지센터",
    address: "경기도 군포시 군포로 502",
    phone: "031-390-7640",
    hours: "평일 09:00~18:00",
    lat: 37.3512,
    lng: 126.9351,
    tags: ["신분증", "복지상담"],
  },
];

export const INSTITUTIONS: Institution[] = [
  {
    name: "한국법무보호복지공단 경기지부",
    kind: "branch",
    sido: "경기도",
    district: "수원시 팔달구",
    address: "경기도 수원시 팔달구 매산로 89",
    phone: "1670-7004",
  },
  {
    name: "한국법무보호복지공단 본부",
    kind: "head",
    sido: "경기도",
    district: "안양시 동안구",
    address: "경기도 안양시 동안구 관평로 212번길 52",
    phone: "1670-7004",
  },
  {
    name: "법무보호교육원",
    kind: "training",
    sido: "충청남도",
    district: "천안시 동남구",
    address: "충청남도 천안시 동남구 목천읍 교천4길 40",
    phone: "1670-7004",
  },
  {
    name: "허그상담소 경기",
    kind: "hug",
    sido: "경기도",
    district: "수원시 팔달구",
    address: "경기도 수원시 팔달구 매산로 89 3층",
    phone: "1670-7004",
  },
  {
    name: "안양시 정신건강복지센터",
    kind: "mental_health",
    sido: "경기도",
    district: "안양시 만안구",
    address: "경기도 안양시 만안구 안양로 293",
    phone: "1577-0199",
  },
  {
    name: "군포시 정신건강복지센터",
    kind: "mental_health",
    sido: "경기도",
    district: "군포시",
    address: "경기도 군포시 산본로 323",
    phone: "1577-0199",
  },
];

export const DISTRICT_OFFICES: DistrictOffice[] = [
  {
    sido: "경기도",
    sigungu: "안양시 동안구",
    dong: "호계1동",
    kind: "행정복지센터",
    name: "호계1동 행정복지센터",
    zipcode: "14108",
    address: "경기도 안양시 동안구 흥안대로 427",
  },
  {
    sido: "경기도",
    sigungu: "안양시 동안구",
    dong: "호계3동",
    kind: "행정복지센터",
    name: "호계3동 행정복지센터",
    zipcode: "14117",
    address: "경기도 안양시 동안구 경수대로 590",
  },
  {
    sido: "경기도",
    sigungu: "안양시 동안구",
    dong: "부림동",
    kind: "행정복지센터",
    name: "부림동 행정복지센터",
    zipcode: "14066",
    address: "경기도 안양시 동안구 부림로 168",
  },
];

// ── 상담 스트림 대본 (POST /api/chat, SSE) ───────────────────────────
//
// **한 프레임씩 순서대로 흘려보낸다.** `streamChat`이 `res.body.getReader()`로 읽으므로
// 진짜 스트리밍처럼 글자가 흐르고, 캡처할 때 "답변이 만들어지는 중"인 장면도 잡힌다.

/** SSE 프레임 하나. `event`와 `data`를 그대로 조립해 보낸다. */
export type SseFrame = { event: string; data: unknown };

const CHAT_ANSWER = [
  "임시 신분증은 신청한 그 자리에서 받으실 수 있어요.\n\n",
  "주민센터 창구에서 주민등록증 재발급을 신청하면, ",
  "담당자가 그 자리에서 임시 신분증을 만들어 줍니다. ",
  "본 신분증이 나오기 전까지 그것으로 은행 업무를 보실 수 있어요.\n\n",
  "다만 임시 신분증은 유효기간이 있어서, ",
  "본 신분증이 나오면 같은 창구에서 바꿔 받으셔야 합니다.",
];

export const CHAT_STREAM: SseFrame[] = [
  {
    event: "triage",
    data: {
      routes: [
        { key: "R9", label: "신분증", rank: 1, reason: "통장과 일자리가 여기서 막혀 있어요." },
        { key: "R10", label: "통장", rank: 2, reason: "지원금을 받으려면 통장이 필요해요." },
      ],
    },
  },
  { event: "evidence", data: { stage: "confirmed", notice: "" } },
  ...CHAT_ANSWER.map((delta) => ({ event: "text", data: { delta } })),
  {
    event: "card",
    data: {
      institution_id: "identity-id-card-reissue",
      name: "주민등록증 재발급",
      route_label: "신분증",
      summary_easy:
        "주민등록증을 다시 만드는 일이에요. 신청한 자리에서 임시 신분증을 받아 그날부터 쓸 수 있습니다.",
      where: "사는 곳 주민센터",
      docs: ["사진 1장 (3.5cm x 4.5cm)", "수용증명서 또는 신분증(있는 대로)"],
      next_step: "사진 1장을 챙겨서 주민센터 창구에 가 주세요.",
      deadline: null,
      source_url: "https://www.gov.kr/",
      verified_note: VERIFIED,
      options: [
        {
          org: "주민센터",
          where: "사는 곳 주민센터",
          next_step: "사진 1장을 챙겨서 창구에 가 주세요.",
          docs: ["사진 1장", "수용증명서"],
          desk_place: "호계1동 행정복지센터 민원창구",
          desk_say: "주민등록증 재발급 신청하러 왔습니다.",
          contact_org: "정부민원안내콜센터",
          contact_phone: "국번없이 110",
          contact_hours: "",
        },
      ],
      benefit_summary: "수수료는 5,000원이고 임시 신분증을 그 자리에서 받습니다.",
      eligibility: ["주민등록이 살아 있는 본인"],
      steps: ["사진을 찍습니다", "주민센터 창구에 냅니다", "임시 신분증을 받습니다"],
      cautions: ["주민등록이 말소되어 있으면 재등록을 먼저 합니다"],
      source_urls: ["https://www.gov.kr/", "https://www.mois.go.kr/"],
    },
  },
  {
    event: "suggestions",
    data: {
      questions: [
        "임시 신분증으로 통장을 만들 수 있어요?",
        "본 신분증은 언제 나와요?",
        "주소가 말소됐으면 어떡해요?",
      ],
    },
  },
  { event: "done", data: {} },
];

// ── 기기에 남아 있는 것처럼 보여야 하는 값 ────────────────────────────
//
// **프레임 안의 가짜 저장소에 미리 심는다** (`installMocks.ts`). 이것이 없으면
// `useRegionLookup`이 위치를 모르는 상태로 시작해 지도가 지역 고르기 화면으로 넘어가고,
// 홈 화면의 "가까운 곳"도 비어 버린다.

export const SEEDED_STORAGE: Record<string, string> = {
  // `tokenStore`가 읽는 세션 토큰. 이 값이 있어야 화면들이 서버를 부른다.
  "majung.session": "showcase-demo-token",
  "majung365.signedUp": "1",
  "majung365.place": JSON.stringify({
    sido: PLACE.sido,
    district: PLACE.district,
    dong: PLACE.dong,
    lat: PLACE.lat,
    lng: PLACE.lng,
  }),
  // 알림을 전부 안 읽은 상태로 두면 배지가 켜진다. 오래전 시각을 넣는다.
  "majung365.alertsSeen": at(-30, 0, 0),
  "majung365.answers": JSON.stringify({
    "Q1-1": "아니요",
    "Q1-3": "새로 신고해야 해요",
    "Q2-1": "네",
    "Q3-1": "잃어버렸어요",
    "Q4-1": "네",
    "Q5-2": "가끔 힘들어요",
    "Q6-1": "아직 없어요",
  }),
};

/** 세션에 넣을 값. `startSession()`에 그대로 넘긴다. */
export const SESSION = {
  name: USER.name,
  tasks: TASKS,
  completed: RESTORE.completed,
  place: {
    sido: PLACE.sido,
    district: PLACE.district,
    dong: PLACE.dong,
    lat: PLACE.lat,
    lng: PLACE.lng,
  },
} as const;
