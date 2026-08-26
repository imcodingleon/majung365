// 초기 진단 문항 세트 (필수 14개 + 꼬리 13개).
//
// ⚠️ **이 파일이 문항 값의 유일한 자리다.** 화면 코드는 questionTypes.ts의 타입만 보고 그린다.
//
// 두 가지가 아직 기획 검토 중이다. 확정되면 **이 파일의 값만 바꾸면 반영된다.**
//   1. `optionId` 값 (intake-questions.md §9-1)
//   2. 문항 최종 문구 검수 (기획서 §12-11)
//
// 정본: `_bmad-output/specs/spec-majung-2nd/intake-questions.md`
// 문구 규칙: 기획서 §3.9 (판단하는 어감 금지 · 쉬운 말 · 1인칭 진술 · 한 문장에 한 가지)
import type { IntakeQuestion } from "./questionTypes";

/** 모든 문항에 두는 "잘 모르겠어요". 같은 역할의 선택지가 이미 있으면 넣지 않는다. */
const UNKNOWN = { id: "UNKNOWN", label: "잘 모르겠어요" };

/**
 * 이 항목이 필요 없는 사람이 고르는 답. **목록 맨 아래에 둔다.**
 *
 * 이것이 없으면 그 지원 항목이 **모든 사용자에게 무조건 뜬다.** 빚이 한 푼도 없는 사람에게
 * 개인회생 안내가 붙고, 아프지 않은 사람에게 병원 안내가 붙는다. 하지도 않은 일이 할 일
 * 목록에 쌓이면 목록 전체를 믿지 않게 된다.
 *
 * 문구를 다섯 문항에서 똑같이 쓴다. 같은 역할의 선택지가 문항마다 다른 말이면 그때마다
 * 다시 읽어야 한다. "지금은"을 붙인 것은 영구적 거절이 아니라 오늘의 상태라는 뜻이다 —
 * 나중에 마음이 바뀌면 다시 고를 수 있어야 한다.
 *
 * 판정에서는 `intake_rules.json`의 `resolved_options`가 이 값을 받아 할 일에서 뺀다.
 * **선택지만 넣고 그쪽을 비워 두면 아무것도 달라지지 않는다.** 둘이 짝이다.
 */
const NOT_NEEDED = { id: "NOT_NEEDED", label: "지금은 필요 없어요" };

export const INTAKE_QUESTIONS: readonly IntakeQuestion[] = [
  // ── 분야 1 주거 ─────────────────────────────────────────────
  {
    id: "Q1-1",
    sectionId: "housing",
    routeId: "R1",
    prompt: "지금 머물 곳은 어떤 상황인가요?",
    kind: "single",
    dataKey: "accommodationStatus",
    options: [
      { id: "NO_PLACE_TONIGHT", label: "오늘 밤 잘 곳이 없어요" },
      { id: "TEMPORARY_UNSTABLE", label: "잠시 머물 곳은 있지만 곧 나가야 해요" },
      { id: "CANNOT_LIVE_WITH_CONTACTS", label: "가족이나 아는 사람이 있지만 함께 살 수 없어요" },
      // **"직업교육 장소가 멀어 오가기 어려워요"를 뺐다** (2026-08-26). 지금 머물 곳을
      // 묻는 자리인데 그것은 다니는 문제라, 고르면 거처가 없는 것으로 판정됐다.
      { id: "STABLE_PLACE", label: "계속 지낼 곳이 있어요" },
      UNKNOWN,
    ],
  },
  {
    id: "Q1-1-1",
    sectionId: "housing",
    routeId: "R1",
    prompt: "지금 머무는 곳은 언제까지 있을 수 있나요?",
    kind: "date",
    dataKey: "temporaryStayEndDate",
    allowUnknown: true,
    // **NO_PLACE_TONIGHT은 조건에서 뺐다.** 계약 문서(intake-questions.md Q1-1-1)는 둘 다
    // 넣으라고 적혀 있지만, 오늘 밤 잘 곳이 없다고 답한 사람에게 "지금 머무는 곳은 언제까지"를
    // 물으면 답할 수 있는 질문이 아니다. 머무는 곳이 없다는 것이 방금 그 사람의 답이다.
    // 그 경우 급한 정도는 이미 정해져 있어 종료일을 받을 이유도 없다 (2026-08-23).
    showWhen: { questionId: "Q1-1", optionIds: ["TEMPORARY_UNSTABLE"] },
  },
  {
    id: "Q1-2",
    sectionId: "housing",
    routeId: "R4",
    // 원래는 공단 주거지원의 자격 요건 넷을 그대로 선택지로 옮겨 두었다. 요건은 **창구에서
    // 서류로 확인할 것**이지 사용자에게 물을 것이 아니었다. 무주택 여부를 본인이 알기 어렵고,
    // 부양가족 유무와 세대주 여부는 문구로 구별되지 않아 사실상 같은 답이 둘이었다.
    // 게다가 R4 카드(긴급복지 주거지원)는 가족 단위 요건을 담고 있지 않다 (2026-08-23).
    // **"장기 거주"라고 못 박는다** (2026-08-26). "오래 지낼 집"은 앞 문항의 "잠시
    // 머물 곳"과 눈으로 갈리지 않아, 도움말로 그 차이를 설명하고 있었다. 물음 자체가
    // 구별되면 도움말이 필요 없다.
    prompt: "장기 거주 할 집을 구해야 하나요?",
    kind: "single",
    dataKey: "housingNeed",
    options: [
      { id: "NEEDED", label: "네, 장기 거주 할 집이 필요해요" },
      NOT_NEEDED,
      UNKNOWN,
    ],
  },
  {
    id: "Q1-3",
    sectionId: "housing",
    routeId: "R11",
    // 도움말을 걷었다 (2026-08-26). 선택지에 "일정하게 지내는 곳이 없어요"가 이미
    // 있어서, 그것을 고르라고 다시 적으면 같은 말을 두 번 하는 셈이었다.
    prompt: "지금 지내는 곳이 주민등록 주소와 같나요?",
    kind: "single",
    dataKey: "addressStatus",
    options: [
      { id: "MATCHED", label: "네, 지금 지내는 곳으로 되어 있어요" },
      { id: "MISMATCHED", label: "아니요, 예전에 살던 곳이나 다른 주소로 되어 있어요" },
      // 말소와 거주불명은 다른 상태이지만 저장값은 하나다. 문구가 두 경우를 모두 포괄한다.
      {
        id: "INACTIVE_CONFIRMED",
        label: "주민센터에서 주민등록 주소가 없거나 확인이 안 된다고 했어요",
      },
      { id: "NO_FIXED_RESIDENCE", label: "일정하게 지내는 곳이 없어요" },
      UNKNOWN,
    ],
  },
  {
    id: "Q1-3-1",
    sectionId: "housing",
    routeId: "R11",
    prompt: "지금 지내는 곳을 새 주민등록 주소로 신고할 수 있나요?",
    help: "공식 이름은 ‘전입신고’예요.",
    kind: "single",
    dataKey: "canRegisterCurrentResidence",
    showWhen: { questionId: "Q1-3", optionIds: ["MISMATCHED"] },
    options: [
      { id: "YES", label: "이 주소로 신고할 수 있어요" },
      { id: "UNKNOWN", label: "아는 사람 집이나 시설에 있어서 신고할 수 있는지 모르겠어요" },
    ],
  },
  {
    id: "Q1-3-2",
    sectionId: "housing",
    routeId: "R11",
    // "넘겼나요"로 쓰지 않는다. 기한을 어겼다는 지적이 되어 규칙 ⑦에 어긋난다.
    prompt: "전입신고 기한(14일)은 지났나요?",
    kind: "single",
    dataKey: "moveInReportOverdue",
    showWhen: { questionId: "Q1-3", optionIds: ["MISMATCHED", "INACTIVE_CONFIRMED"] },
    options: [
      { id: "YES", label: "네" },
      { id: "NO", label: "아니요" },
      UNKNOWN,
    ],
  },

  // ── 분야 2 생계·긴급비용 ─────────────────────────────────────
  {
    id: "Q2-1",
    sectionId: "living",
    routeId: "R2",
    // 용도 넷은 결과가 같지만 남긴다. **창구에서 할 말과 챙겨 갈 서류가 갈리기 때문이다.**
    // R2 카드의 준비물에 "돈이 필요한 이유를 보여주는 서류"가 있는데, 그것이 진료비
    // 영수증인지 임대차계약서인지는 이 답이 정한다 (2026-08-23).
    // **여러 개를 고를 수 있다** (2026-08-26 결정 H-2). 병원비와 월세가 동시에 급한
    // 사람이 실제로 있는데, 하나만 받으면 창구에서 한쪽 서류를 안 들고 가게 된다.
    // 서버가 고른 것을 모두 준비물에 채운다 (`purpose.py`).
    prompt: "지금 급하게 필요한 돈은 어디에 쓰나요?",
    help: "여러 개를 고르셔도 돼요.",
    kind: "multi",
    dataKey: "emergencyExpenseType",
    options: [
      { id: "LIVING_EXPENSE", label: "밥값과 생활비가 필요해요" },
      { id: "MEDICAL_EXPENSE", label: "병원비가 필요해요" },
      { id: "HOUSING_EXPENSE", label: "월세나 방 구할 돈이 필요해요" },
      { id: "CHILD_EDUCATION", label: "아이 학비와 학용품값이 필요해요" },
      NOT_NEEDED,
      UNKNOWN,
    ],
  },
  {
    id: "Q2-2",
    sectionId: "living",
    routeId: "R12",
    prompt: "정부가 매달 주는 생활비 지원을 신청했나요?",
    help: "소득과 재산이 적은 집에 정부가 매달 생활비를 주는 제도예요. 공식 이름은 ‘생계급여’예요.",
    kind: "single",
    dataKey: "livelihoodBenefitStatus",
    options: [
      { id: "RECEIVING", label: "지금 받고 있어요" },
      { id: "PENDING", label: "신청했고 결과를 기다리고 있어요" },
      // "아직"을 쓰지 않는다. 했어야 하는데 안 했다는 뉘앙스가 된다 (규칙 ⑦).
      { id: "NOT_APPLIED", label: "신청은 안 했어요" },
      // "잘 모르겠어요"를 따로 두지 않는다. 이 선택지가 같은 역할을 한다 (규칙 ①).
      { id: "UNKNOWN", label: "신청했는지 잘 모르겠어요" },
      { id: "OPT_OUT", label: "지금은 알아보고 싶지 않아요" },
    ],
  },
  {
    id: "Q2-2-1",
    sectionId: "living",
    routeId: "R12",
    prompt: "지금 생활비가 얼마나 급한가요?",
    kind: "single",
    dataKey: "livelihoodUrgency",
    showWhen: { questionId: "Q2-2", optionIds: ["PENDING", "NOT_APPLIED", "UNKNOWN"] },
    options: [
      { id: "IMMEDIATE", label: "오늘이나 며칠 안에 쓸 생활비가 없어요" },
      { id: "CHRONIC", label: "매달 생활비가 계속 부족해요" },
      { id: "BOTH", label: "두 가지 모두 맞아요" },
      UNKNOWN,
    ],
  },

  // ── 분야 3 신분·행정 ────────────────────────────────────────
  {
    id: "Q3-1",
    sectionId: "identity",
    routeId: "R9",
    prompt: "지금 바로 쓸 수 있는 신분증이 있나요?",
    help: "주민등록증, 운전면허증, 사진이 붙은 임시 신분증을 말해요. 임시 신분증은 주민센터에서 받아요.",
    kind: "single",
    dataKey: "identityStatus",
    options: [
      { id: "USABLE_ID", label: "네, 있어요" },
      { id: "NOT_USABLE", label: "아니요, 없어요" },
      UNKNOWN,
    ],
  },
  {
    id: "Q3-1-1",
    sectionId: "identity",
    routeId: "R9",
    prompt: "신분증은 지금 어떤 상황인가요?",
    help: "주민등록증을 신청한 다음 주민센터에 말하면 임시 신분증을 받을 수 있어요. 사진이 붙어 있고 30일 동안 쓸 수 있어요. 공식 이름은 ‘주민등록증 발급신청 확인서’예요.",
    kind: "single",
    dataKey: "identityDetail",
    showWhen: { questionId: "Q3-1", optionIds: ["NOT_USABLE"] },
    // 같은 것을 두 번 묻지 않는다. Q1-3에서 이미 답했으면 선택지를 빼고 확인 문구로 대체한다 (규칙 ⑪).
    noteWhen: {
      when: { questionId: "Q1-3", optionIds: ["INACTIVE_CONFIRMED"] },
      text: "주소 문제는 이미 확인했어요.",
    },
    options: [
      { id: "PASSPORT_ONLY", label: "날짜가 지나지 않은 여권만 있어요" },
      { id: "REISSUE_APPLIED", label: "주민등록증은 신청했지만 임시 신분증은 받지 않았어요" },
      { id: "REISSUE_NOT_APPLIED", label: "주민등록증은 신청 안 했어요" },
      {
        id: "REGISTRATION_INACTIVE",
        label: "주민센터에서 주민등록 주소가 없거나 확인이 안 된다고 했어요",
        hideWhen: { questionId: "Q1-3", optionIds: ["INACTIVE_CONFIRMED"] },
      },
      UNKNOWN,
    ],
  },
  {
    id: "Q3-2",
    sectionId: "identity",
    routeId: "R10",
    prompt: "내 이름으로 된 통장을 지금 쓸 수 있나요?",
    help: "지원금을 받고, 필요할 때 돈을 찾거나 보낼 수 있는 통장을 말해요.",
    kind: "single",
    dataKey: "bankAccountStatus",
    options: [
      { id: "USABLE", label: "지금 쓸 수 있어요" },
      { id: "UNUSABLE", label: "통장은 있지만 쓰기 어려워요" },
      { id: "NONE", label: "내 이름으로 된 통장이 없어요" },
      UNKNOWN,
    ],
  },
  {
    id: "Q3-2-1",
    sectionId: "identity",
    routeId: "R10",
    prompt: "통장을 쓸 때 어떤 점이 어려운가요?",
    kind: "single",
    dataKey: "bankAccountDetail",
    showWhen: { questionId: "Q3-2", optionIds: ["UNUSABLE"] },
    options: [
      { id: "LIMIT_RESTRICTED", label: "하루에 보낼 수 있는 돈이 너무 적어요" },
      { id: "BANK_RESTRICTED", label: "은행에서 통장을 막아 두었어요" },
      { id: "SEIZED", label: "빚 때문에 통장에 있는 돈을 쓸 수 없어요" },
      { id: "UNKNOWN", label: "이유를 잘 모르겠어요" },
    ],
  },
  {
    id: "Q3-2-2",
    sectionId: "identity",
    routeId: "R10",
    prompt: "통장은 지금 어떤 상황인가요?",
    kind: "single",
    dataKey: "bankAccountDetail",
    showWhen: { questionId: "Q3-2", optionIds: ["NONE"] },
    options: [
      { id: "FIRST_OPEN", label: "통장을 새로 만들려고 해요" },
      { id: "OPENING_REJECTED", label: "은행에서 새 통장을 만들 수 없다고 했어요" },
      { id: "SEIZURE_WORRY", label: "빚 때문에 새 통장도 막힐까 걱정돼요" },
      { id: "FAMILY_ONLY", label: "가족 이름으로 된 통장만 쓸 수 있어요" },
      UNKNOWN,
    ],
  },

  // ── 분야 4 취업·직업 ────────────────────────────────────────
  {
    id: "Q4-1",
    sectionId: "employment",
    routeId: "R6",
    // 희망·현재 상태·과거 이력을 한 목록에 섞지 않는다. 두 단계로 나눴다 (규칙 ⑨).
    prompt: "지금 일을 하고 있나요?",
    kind: "single",
    dataKey: "employmentCurrentStatus",
    options: [
      { id: "SEEKING", label: "아니요, 일을 찾고 있어요" },
      { id: "EMPLOYED_BUSINESS_STUDENT", label: "네, 일하거나 사업을 하거나 학교에 다녀요" },
      {
        id: "GOVERNMENT_JOB_OR_UNEMPLOYMENT_BENEFIT",
        label: "정부 일자리 사업에 다니거나 실업급여를 받고 있어요",
      },
      UNKNOWN,
    ],
  },
  {
    id: "Q4-1-1",
    sectionId: "employment",
    routeId: "R6",
    prompt: "일자리 문제로 어떤 도움이 필요한가요?",
    kind: "single",
    dataKey: "employmentSupportNeed",
    showWhen: {
      questionId: "Q4-1",
      optionIds: ["SEEKING", "GOVERNMENT_JOB_OR_UNEMPLOYMENT_BENEFIT"],
    },
    options: [
      { id: "JOB_NOW", label: "바로 일자리를 찾고 싶어요" },
      { id: "TRAIN_AND_WORK", label: "직업교육을 받고 일하고 싶어요" },
      { id: "STAGED_SUPPORT", label: "상담부터 교육, 일자리까지 차례로 도움받고 싶어요" },
      { id: "TRAINING_ONLY", label: "직업교육만 받고 싶어요" },
      UNKNOWN,
    ],
  },
  {
    id: "Q4-1-2",
    sectionId: "employment",
    routeId: "R6",
    // 희망 사항과 섞으면 안 되는 과거 이력이다. 재참여 자격 판정에 쓴다.
    prompt: "허그일자리에 참여해 본 적 있나요?",
    kind: "single",
    dataKey: "hugJobHistory",
    showWhen: {
      questionId: "Q4-1",
      optionIds: ["SEEKING", "GOVERNMENT_JOB_OR_UNEMPLOYMENT_BENEFIT"],
    },
    options: [
      { id: "YES", label: "네" },
      { id: "NO", label: "아니요" },
      UNKNOWN,
    ],
  },
  {
    id: "Q4-2",
    sectionId: "employment",
    routeId: "R7",
    prompt: "장사나 사업을 시작하려고 하나요?",
    kind: "single",
    dataKey: "startupIntent",
    options: [
      { id: "PREPARING", label: "네, 준비하고 있어요" },
      { id: "INTERESTED_NO_PREP", label: "관심은 있는데 준비한 것은 없어요" },
      { id: "NOT_INTERESTED", label: "아니요, 지금은 생각이 없어요" },
      UNKNOWN,
    ],
  },
  {
    id: "Q4-2-1",
    sectionId: "employment",
    routeId: "R7",
    prompt: "장사나 사업을 하려고 준비한 것이 있나요?",
    kind: "multi",
    dataKey: "startupReadinessIds",
    showWhen: { questionId: "Q4-2", optionIds: ["PREPARING"] },
    options: [
      { id: "SKILL_OR_EXPERIENCE", label: "관련 자격증이 있거나 같은 일을 1년 이상 해봤어요" },
      { id: "STARTUP_TRAINING", label: "창업교육을 받았어요" },
      { id: "LIVING_BASE", label: "사업할 곳을 정했어요" },
      { id: "OWN_FUNDS", label: "내가 낼 돈을 준비할 수 있어요" },
      // 넷 중 하나도 해당하지 않는 사람이 고를 것이 없으면 다음 문항으로 넘어갈 수 없다.
      // 다른 복수선택 문항(Q1-2)과 같은 자리에 같은 선택지를 둔다.
      { ...UNKNOWN, exclusive: true },
    ],
  },

  // ── 분야 5 건강·심리 ────────────────────────────────────────
  {
    id: "Q5-1",
    sectionId: "health",
    routeId: "R3",
    // R3 카드는 "병원을 연결해 주고 진료비와 약값을 도와주고 건강검진도 받을 수 있다"를
    // 한 문장에 담는다. 진료와 약을 따로 물을 근거가 카드에 없어 합쳤다.
    // **"가족의 병원비"는 뺐다.** 공단 기초건강지원은 본인 대상이라 그 답을 고르면
    // 답이 없는 안내가 나간다. **"우울하거나 불안해서"도 뺐다.** 바로 다음 문항이
    // 마음 상담을 전담한다 (2026-08-23).
    prompt: "건강 때문에 어떤 도움이 필요한가요?",
    kind: "single",
    dataKey: "healthSupportNeed",
    options: [
      // 이 답만 119·응급실 안내로 간다. 목록 맨 위에 두고 구분선으로 떼어 놓는다 (규칙 ⑩).
      { id: "IMMEDIATE_TREATMENT", label: "지금 바로 치료받아야 해요", standout: true },
      { id: "TREATMENT", label: "병원에 가거나 약을 받아야 해요" },
      { id: "HEALTH_CHECKUP", label: "건강검진을 받고 싶어요" },
      NOT_NEEDED,
      UNKNOWN,
    ],
  },
  {
    id: "Q5-2",
    sectionId: "health",
    routeId: "R8",
    // 상담 방식(1:1·집단·심리검사·가족)을 넷으로 물었는데 **센터에 가면 거기서 정하는 일이다.**
    // R8 카드에도 방식을 나누는 내용이 없어, 고른 답이 안내를 바꾸지 못했다.
    // 미리 정하게 하면 무엇이 자기에게 맞는지 또 판단해야 한다 (2026-08-23).
    prompt: "마음이 힘들 때 상담을 받아 보시겠어요?",
    help: "어떤 방식으로 상담할지는 가서 함께 정해요. 지금 고르지 않으셔도 돼요.",
    kind: "single",
    dataKey: "counselingNeed",
    options: [
      { id: "WANTED", label: "네, 상담받고 싶어요" },
      NOT_NEEDED,
      UNKNOWN,
    ],
  },
  {
    id: "Q6-1",
    sectionId: "rights",
    routeId: "R13",
    prompt: "교도소·구치소에 있던 기간과 출소한 날이 적힌 증명서가 있나요?",
    help: "공식 이름은 ‘수용·출소증명서’예요. 형사사법포털이나 가까운 교도소·구치소에서 받을 수 있어요.",
    kind: "single",
    dataKey: "releaseCertificateStatus",
    options: [
      { id: "READY", label: "있어요" },
      { id: "PENDING", label: "지금 받는 중이에요" },
      { id: "NONE", label: "없어요" },
      UNKNOWN,
    ],
  },
  {
    id: "Q6-2",
    sectionId: "rights",
    routeId: "R14",
    prompt: "빚 문제는 지금 어떻게 하고 있나요?",
    kind: "single",
    dataKey: "debtProcedureStage",
    options: [
      { id: "STARTING", label: "처음 알아보는 중이에요" },
      { id: "COURT_PROCESS", label: "법원에 개인회생이나 파산을 신청해 진행 중이에요" },
      { id: "CCRS_PROCESS", label: "신용회복위원회에서 빚 조정을 진행 중이에요" },
      { id: "STOPPED", label: "신청했는데 중간에 멈췄거나 안 됐어요" },
      NOT_NEEDED,
      UNKNOWN,
      // 모르는 것과 말하고 싶지 않은 것은 다르다. 채무는 민감한 주제라 둘 다 둔다 (규칙 ⑥).
      { id: "OPT_OUT", label: "답하고 싶지 않아요" },
    ],
  },
  {
    id: "Q6-2-1",
    sectionId: "rights",
    routeId: "R14",
    // "장사로 버는 돈"으로 좁히지 않는다. 프리랜서 수입이 빠지면 자격 판정이 틀어진다.
    prompt: "월급, 연금, 직접 일해서 버는 돈처럼 매달 들어오는 돈이 있나요?",
    kind: "single",
    dataKey: "incomeContinuity",
    showWhen: { questionId: "Q6-2", optionIds: ["STARTING"] },
    options: [
      { id: "REGULAR", label: "꾸준히 있어요" },
      { id: "IRREGULAR", label: "일용직처럼 들쑥날쑥해요" },
      { id: "NONE", label: "지금은 없어요" },
      UNKNOWN,
    ],
  },
  {
    id: "Q6-3",
    sectionId: "rights",
    routeId: "R15",
    prompt: "출소하고 나서 병원비를 줄여주는 보험이나 지원을 확인했나요?",
    help: "‘의료급여’는 생활이 어려운 사람의 병원비를 정부가 도와주는 제도예요. 건강보험이 직장 가입인지 지역 가입인지는 몰라도 괜찮아요.",
    kind: "single",
    dataKey: "medicalCoverageStatus",
    options: [
      // 도움말에 설명이 있어도 선택지만 읽고 고르는 사용자가 많다. 쉬운 설명을 빼지 않는다 (규칙 ⑤).
      { id: "MEDICAL_AID", label: "병원비 지원(의료급여)을 쓰고 있어요" },
      { id: "HEALTH_INSURANCE", label: "건강보험을 쓰고 있어요" },
      { id: "PENDING", label: "신청하거나 바꾸는 중이에요" },
      // "잘 모르겠어요"를 따로 두지 않는다. 이 선택지가 같은 역할을 한다 (규칙 ①).
      { id: "UNCHECKED", label: "확인 안 했어요" },
      { id: "BLOCKED_CONFIRMED", label: "병원이나 건강보험공단에서 쓸 수 없다고 했어요" },
    ],
  },
];
