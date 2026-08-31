// AI 채팅 팝업 (§6.1).
import { expect, test } from "@playwright/test";

import { openApp } from "./support/app";

/** 홈에서 첫 카드의 채팅을 연다. 팝업은 라우트가 아니라 홈이 얹는다. */
async function openChat(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "AI 챗봇과 대화하기" }).first().click();
  await expect(page.getByRole("textbox", { name: "질문 입력" })).toBeVisible();
}

/** 서버가 보내는 제도 카드 한 장. 필드 이름은 `CardData` 계약 그대로다. */
const CARD = {
  institution_id: "identity-proof-of-release",
  name: "수용·출소증명서",
  route_label: "수용·출소증명서",
  summary_easy: "출소하신 교정시설에서 받을 수 있어요.",
  where: "출소한 교정시설 민원실",
  docs: ["본인 신분증"],
  next_step: "교정시설에 전화해서 발급을 요청하세요.",
  deadline: null,
  source_url: "",
  verified_note: "",
  options: [
    {
      org: "수용·출소증명서",
      where: "출소한 교정시설 민원실",
      next_step: "교정시설에 전화해서 발급을 요청하세요.",
      docs: ["본인 신분증"],
      desk_place: "교정시설 민원실",
      desk_say: "출소증명서 발급받으러 왔어요",
      contact_org: "교정민원콜센터",
      contact_phone: "1363",
      contact_hours: "",
    },
  ],
};

test.describe("AI 채팅", () => {
  test("답을 기다리는 동안 기다리는 중임을 알린다", async ({ page }) => {
    // **답이 늦을 때 아무 표시가 없으면 안 보낸 것으로 여긴다.** 저리터러시 전제에서는
    // 같은 질문을 여러 번 보내게 된다.
    await openApp(page, "/today", { chatDelayMs: 2000, freezeClock: false });
    await openChat(page);

    await page.getByRole("textbox", { name: "질문 입력" }).fill("출소증명서는 어디서 받나요?");
    await page.getByRole("button", { name: "보내기" }).click();

    // 보낸 말이 먼저 화면에 남고, 그 아래에 기다린다는 표시가 붙는다.
    await expect(page.getByText("출소증명서는 어디서 받나요?")).toBeVisible();
    await expect(page.getByLabel("답을 찾고 있어요")).toBeVisible();
  });

  test("답이 오면 기다림 표시가 사라지고 답이 남는다", async ({ page }) => {
    await openApp(page, "/today", {
      chatDelayMs: 300,
      freezeClock: false,
      chatDeltas: ["출소하신 교정시설에서 ", "받으실 수 있어요."],
    });
    await openChat(page);

    await page.getByRole("textbox", { name: "질문 입력" }).fill("어디서 받나요?");
    await page.getByRole("button", { name: "보내기" }).click();

    await expect(page.getByText("출소하신 교정시설에서 받으실 수 있어요.")).toBeVisible();
    await expect(page.getByLabel("답을 찾고 있어요")).toBeHidden();
  });

  test("제도 안내는 답변에 붙고, 창구와 연락처는 접지 않는다", async ({ page }) => {
    // **§6.4 ③단계는 연락처가 항상 붙는 것이다.** 접어 두면 그 계약이 깨진다.
    // 준비물처럼 지금 당장 읽지 않아도 되는 것만 접는다.
    await openApp(page, "/today", {
      freezeClock: false,
      chatDeltas: ["교정시설에서 받으실 수 있어요."],
      chatCards: [CARD],
    });
    await openChat(page);

    await page.getByRole("textbox", { name: "질문 입력" }).fill("어디서 받나요?");
    await page.getByRole("button", { name: "보내기" }).click();

    // 펼쳐진 채로 보이는 것
    await expect(page.getByText("교정시설 민원실에 가서 “출소증명서 발급받으러 왔어요”라고 말하면 돼요.")).toBeVisible();
    await expect(page.getByText(/교정민원콜센터 1363/)).toBeVisible();

    // 접혀 있는 것
    await expect(page.getByText("본인 신분증")).toBeHidden();
    await page.getByRole("button", { name: /수용·출소증명서 자세히 보기/ }).click();
    await expect(page.getByText("본인 신분증")).toBeVisible();
  });

  test("제도 안내가 따로 말풍선을 만들지 않는다", async ({ page }) => {
    // 예전에는 카드마다 별도 말풍선이 서고 "어디서: …"가 고정 서식으로 나왔다.
    await openApp(page, "/today", {
      freezeClock: false,
      chatDeltas: ["교정시설에서 받으실 수 있어요."],
      chatCards: [CARD],
    });
    await openChat(page);

    await page.getByRole("textbox", { name: "질문 입력" }).fill("어디서 받나요?");
    await page.getByRole("button", { name: "보내기" }).click();

    await expect(page.getByText("교정시설에서 받으실 수 있어요.")).toBeVisible();
    await expect(page.getByText(/^어디서: /)).toBeHidden();
  });

  test("답을 기다리는 동안에는 다시 보내지 못한다", async ({ page }) => {
    // 두 번 눌러 같은 질문이 두 번 나가는 것을 막는다.
    await openApp(page, "/today", { chatDelayMs: 2000, freezeClock: false });
    await openChat(page);

    await page.getByRole("textbox", { name: "질문 입력" }).fill("얼마나 걸려요?");
    await page.getByRole("button", { name: "보내기" }).click();

    await expect(page.getByLabel("답을 찾고 있어요")).toBeVisible();
    await expect(page.getByRole("button", { name: "보내기" })).toBeDisabled();
  });

  test("빈 채로는 보내지 못한다", async ({ page }) => {
    await openApp(page, "/today", { freezeClock: false });
    await openChat(page);

    await expect(page.getByRole("button", { name: "보내기" })).toBeDisabled();
  });

  test("첫 마디 칩을 누르면 그대로 질문이 된다", async ({ page }) => {
    // 무엇을 물어야 할지 모르는 사람이 첫 말을 떼는 자리다.
    await openApp(page, "/today", { chatDelayMs: 1500, freezeClock: false });
    await openChat(page);

    await page.getByRole("button", { name: "오늘 뭐 해야 해요?" }).click();

    await expect(page.getByLabel("답을 찾고 있어요")).toBeVisible();
  });

  test("할 일에 맞는 첫 질문이 목업을 대신한다", async ({ page }) => {
    // **모든 방에서 같은 네 개가 뜨던 것이 목업이었다.** 통장을 만들러 가는
    // 사람에게도 마음 상담을 알아보는 사람에게도 "돈이 드나요?"가 떴다.
    await openApp(page, "/today", {
      freezeClock: false,
      starterQuestions: { R1: ["어디서 지낼 수 있어요?", "돈을 내야 하나요?"] },
    });
    await openChat(page);

    await expect(page.getByRole("button", { name: "어디서 지낼 수 있어요?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "오늘 뭐 해야 해요?" })).toHaveCount(0);
  });

  test("답이 다 온 뒤에 다음 질문 셋이 뜬다", async ({ page }) => {
    await openApp(page, "/today", {
      freezeClock: false,
      chatSuggestions: ["언제쯤 나와요?", "안 되면 어떡해요?", "다른 것도 되나요?"],
    });
    await openChat(page);

    await page.getByRole("textbox", { name: "질문 입력" }).fill("증명서가 필요해요");
    await page.getByRole("button", { name: "보내기" }).click();

    await expect(page.getByRole("button", { name: "언제쯤 나와요?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "안 되면 어떡해요?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "다른 것도 되나요?" })).toBeVisible();
    // 대화가 시작됐으니 첫 질문 자리는 비워야 한다 — 이미 답한 것을 다시 물으면
    // 사용자는 앞의 답이 지워진 줄 안다.
    await expect(page.getByRole("button", { name: "오늘 뭐 해야 해요?" })).toHaveCount(0);
  });

  test("제안을 누르면 그 문장이 그대로 질문이 된다", async ({ page }) => {
    await openApp(page, "/today", {
      freezeClock: false,
      chatSuggestions: [
        ["언제쯤 나와요?", "안 되면 어떡해요?", "다른 것도 되나요?"],
        ["또 물어봐도 돼요?", "어디로 가요?", "얼마나 걸려요?"],
      ],
    });
    await openChat(page);

    await page.getByRole("textbox", { name: "질문 입력" }).fill("증명서가 필요해요");
    await page.getByRole("button", { name: "보내기" }).click();
    await page.getByRole("button", { name: "언제쯤 나와요?" }).click();

    // 누른 문장이 사용자의 말로 남는다.
    await expect(page.getByText("언제쯤 나와요?").first()).toBeVisible();
  });

  test("새 답변이 오면 앞의 제안이 새것으로 바뀐다", async ({ page }) => {
    // **쌓이면 안 된다.** 지난 답변에 딸린 제안이 새 답변 아래에 그대로 남으면
    // 무엇에 대한 제안인지 알 수 없다.
    await openApp(page, "/today", {
      freezeClock: false,
      chatSuggestions: [
        ["언제쯤 나와요?", "안 되면 어떡해요?", "다른 것도 되나요?"],
        ["또 물어봐도 돼요?", "어디로 가요?", "얼마나 걸려요?"],
      ],
    });
    await openChat(page);

    const input = page.getByRole("textbox", { name: "질문 입력" });
    await input.fill("증명서가 필요해요");
    await page.getByRole("button", { name: "보내기" }).click();
    await expect(page.getByRole("button", { name: "언제쯤 나와요?" })).toBeVisible();

    await input.fill("하나 더 여쭤볼게요");
    await page.getByRole("button", { name: "보내기" }).click();

    await expect(page.getByRole("button", { name: "또 물어봐도 돼요?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "언제쯤 나와요?" })).toHaveCount(0);
  });

  test("제안이 안 오면 칩 자리가 아예 생기지 않는다", async ({ page }) => {
    // 빈 띠가 남으면 입력칸이 그만큼 밀려 내려간다.
    await openApp(page, "/today", { freezeClock: false });
    await openChat(page);

    await page.getByRole("textbox", { name: "질문 입력" }).fill("증명서가 필요해요");
    await page.getByRole("button", { name: "보내기" }).click();
    await expect(page.getByText("교정시설에서 받으실 수 있어요.")).toBeVisible();

    await expect(page.getByRole("button", { name: "오늘 뭐 해야 해요?" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "돈이 드나요?" })).toHaveCount(0);
  });
});
