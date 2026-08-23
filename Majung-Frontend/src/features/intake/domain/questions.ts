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
      { id: "TRAINING_COMMUTE_DIFFICULT", label: "직업교육 장소가 멀어 오가기 어려워요" },
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
    showWhen: { questionId: "Q1-1", optionIds: ["NO_PLACE_TONIGHT", "TEMPORARY_UNSTABLE"] },
  },
  {
    id: "Q1-2",
    sectionId: "housing",
    routeId: "R4",
    prompt: "가족과 오래 살 집을 구하려고 하나요? 맞는 것을 모두 골라 주세요.",
    kind: "multi",
    dataKey: "housingConditionIds",
    options: [
      { id: "HAS_DEPENDENT_FAMILY", label: "함께 살면서 내가 생활비를 대야 할 가족이 있어요" },
      { id: "ALL_HOUSEHOLD_HOMELESS", label: "함께 살 가족 모두 자기 집이 없어요" },
      { id: "RESPONSIBLE_HOUSEHOLD_HEAD", label: "내가 가족의 생활을 책임지고 있어요" },
      { id: "IMMEDIATE_SHELTER", label: "오래 살 집보다 오늘 잘 곳이 먼저 필요해요" },
      { ...UNKNOWN, exclusive: true },
    ],
  },
  {
    id: "Q1-3",
    sectionId: "housing",
    routeId: "R11",
    prompt: "지금 지내는 곳이 주민등록 주소와 같나요?",
    help: "늘 지낼 곳이 없다면 주민등록과 상관없이 ‘일정하게 지내는 곳이 없어요’를 골라 주세요.",
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
    prompt: "지금 가장 급하게 필요한 돈은 어디에 쓰나요?",
    kind: "single",
    dataKey: "emergencyExpenseType",
    // 뒤의 셋은 생활관 이용자·훈련 참여자·구직 활동자에게만 해당한다. 모두에게 보일 이유가 없다.
    expandLabel: "그 밖의 비용",
    options: [
      { id: "LIVING_EXPENSE", label: "밥값과 생활비가 필요해요" },
      { id: "MEDICAL_EXPENSE", label: "병원비가 필요해요" },
      { id: "HOUSING_EXPENSE", label: "월세나 방 구할 돈이 필요해요" },
      { id: "CHILD_EDUCATION", label: "아이 학비와 학용품값이 필요해요" },
      { id: "FACILITY_BASIC_LIVING", label: "생활관에서 지낼 기본 생활비가 필요해요", collapsed: true },
      { id: "TRAINING_PREP", label: "직업교육을 받는 동안 쓸 돈이 필요해요", collapsed: true },
      { id: "JOB_SEARCH_PREP", label: "일자리를 찾는 동안 쓸 돈이 필요해요", collapsed: true },
      UNKNOWN,
    ],
  },
  {
    id: "Q2-1-1",
    sectionId: "living",
    routeId: "R2",
    prompt: "지금 직업교육을 받고 있나요?",
    kind: "single",
    dataKey: "trainingParticipation",
    showWhen: { questionId: "Q2-1", optionIds: ["TRAINING_PREP"] },
    options: [
      { id: "ATTENDING", label: "네, 받고 있어요" },
      { id: "LOOKING", label: "알아보는 중이에요" },
      { id: "NOT_ATTENDING", label: "아니요, 받지 않아요" },
      UNKNOWN,
    ],
  },
  {
    id: "Q2-1-2",
    sectionId: "living",
    routeId: "R2",
    prompt: "일자리를 찾는 중인가요?",
    kind: "single",
    dataKey: "jobSearchActivity",
    showWhen: { questionId: "Q2-1", optionIds: ["JOB_SEARCH_PREP"] },
    options: [
      { id: "SEARCHING", label: "네, 찾고 있어요" },
      { id: "PLANNED", label: "찾아볼 계획이에요" },
      { id: "NOT_NOW", label: "아니요, 지금은 아니에요" },
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
    prompt: "신분증은 지금 어떤 상태인가요?",
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
    prompt: "통장은 지금 어떤 상태인가요?",
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
    prompt: "장사나 사업을 하려고 준비한 것을 모두 골라주세요.",
    kind: "multi",
    dataKey: "startupReadinessIds",
    showWhen: { questionId: "Q4-2", optionIds: ["PREPARING"] },
    options: [
      { id: "SKILL_OR_EXPERIENCE", label: "관련 자격증이 있거나 같은 일을 1년 이상 해봤어요" },
      { id: "STARTUP_TRAINING", label: "창업교육을 받았어요" },
      { id: "LIVING_BASE", label: "사업할 곳을 정했어요" },
      { id: "OWN_FUNDS", label: "내가 낼 돈을 준비할 수 있어요" },
    ],
  },

  // ── 분야 5 건강·심리 ────────────────────────────────────────
  {
    id: "Q5-1",
    sectionId: "health",
    routeId: "R3",
    prompt: "건강 때문에 어떤 도움이 필요한가요?",
    kind: "single",
    dataKey: "healthSupportNeed",
    options: [
      // 이 답 하나만 119·응급실 즉시 안내로 간다. 나머지 여섯과 처리가 다르다 (규칙 ⑩).
      { id: "IMMEDIATE_TREATMENT", label: "지금 바로 치료받아야 해요", standout: true },
      { id: "TREATMENT", label: "병원 진료나 치료가 필요해요" },
      { id: "MEDICATION", label: "약이 필요해요" },
      { id: "HEALTH_CHECKUP", label: "건강검진을 받고 싶어요" },
      { id: "MENTAL_HEALTHCARE", label: "우울하거나 불안해서 병원 진료가 필요해요" },
      { id: "FAMILY_HEALTHCARE", label: "가족의 병원비나 치료 도움이 필요해요" },
      UNKNOWN,
    ],
  },
  {
    id: "Q5-2",
    sectionId: "health",
    routeId: "R8",
    prompt: "마음이 힘들 때 어떤 도움부터 받고 싶은가요?",
    kind: "single",
    dataKey: "counselingNeed",
    options: [
      { id: "INDIVIDUAL", label: "상담사와 1:1로 이야기하고 싶어요" },
      { id: "GROUP", label: "다른 사람들과 함께 상담받고 싶어요" },
      { id: "ASSESSMENT", label: "심리검사를 받고 결과 설명도 듣고 싶어요" },
      { id: "MEDICAL_REFERRAL", label: "병원이나 전문 상담기관을 연결받고 싶어요" },
      { id: "FAMILY", label: "가족도 함께 상담받고 싶어요" },
      UNKNOWN,
    ],
  },

  // ── 분야 6 기타·권리구제 ────────────────────────────────────
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
