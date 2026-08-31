// 시연 프레임에서 화면 한 겹 안쪽까지 열어 주는 조작.
//
// **왜 필요한가.** 담당자와 나누는 대화나 담당자 화면의 AI 요약은 주소로 갈 수 없다.
// 그 화면들은 목록에서 무엇을 눌렀는지를 컴포넌트가 상태로 들고 있고, 그 상태로 가는
// 주소가 없다. 챗봇 대화만 `?openChat=`이라는 길이 열려 있다.
//
// **화면 코드를 고치지 않으려고 이 길을 골랐다.** 상태를 밖에서 넣을 수 있게 하려면
// 화면에 손을 대야 하는데, 시연 도구 하나 때문에 실제 화면의 구조를 바꿀 수는 없다.
//
// **누르는 것은 `aria-label`로 찾는다.** react-native-web이 `accessibilityLabel`을 그대로
// 옮겨 놓으므로, 화면이 낭독기를 위해 이미 붙여 둔 이름을 그대로 쓸 수 있다. 글자 모양이
// 바뀌어도 이 이름은 잘 바뀌지 않는다.

/** 무엇을 기다리다 포기할 때까지. 프레임 하나가 막혀도 나머지는 떠야 한다. */
const WAIT_MS = 12_000;

/** 다시 찾아보는 간격. */
const TICK_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 조건이 맞을 때까지 기다린다. 끝내 못 찾으면 `null`이다. */
async function waitFor<T>(find: () => T | null): Promise<T | null> {
  const until = Date.now() + WAIT_MS;
  for (;;) {
    const found = find();
    if (found) return found;
    if (Date.now() > until) return null;
    await sleep(TICK_MS);
  }
}

/** 이름이 정확히 같은 요소. */
function byLabel(label: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[aria-label="${CSS.escape(label)}"]`);
}

/** 이름이 이 말로 끝나는 첫 요소. 목록의 맨 위 항목을 집을 때 쓴다. */
function byLabelEnding(suffix: string): HTMLElement | null {
  const all = document.querySelectorAll<HTMLElement>("[aria-label]");
  for (const el of all) {
    if ((el.getAttribute("aria-label") ?? "").endsWith(suffix)) return el;
  }
  return null;
}

/**
 * 입력칸에 글자를 넣는다.
 *
 * **값을 바로 넣으면 React가 모른다.** React는 자기가 붙인 setter로 바뀐 값만 보므로,
 * 원래 setter를 찾아 부른 뒤 `input` 사건을 따로 일으켜야 화면이 알아차린다.
 */
function type(input: HTMLInputElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** 담당자 화면에 들어간다. 목업이 어떤 자격이든 통과시킨다. */
async function signInAsStaff(id: string, password: string): Promise<void> {
  const idField = await waitFor(() => byLabel("아이디") as HTMLInputElement | null);
  if (!idField) return;
  const pwField = byLabel("비밀번호") as HTMLInputElement | null;
  if (!pwField) return;

  type(idField, id);
  type(pwField, password);

  // 값이 상태에 들어간 다음 눌러야 한다. 같은 틱에 누르면 빈 값으로 보낸다.
  await sleep(TICK_MS);
  byLabel("들어가기")?.click();
}

/** 목록 맨 위의 요청을 연다. AI 요약이 있는 화면이 그 안쪽이다. */
async function openFirstStaffRequest(): Promise<void> {
  const card = await waitFor(() => byLabelEnding("요청 열기"));
  card?.click();
}

/**
 * 상담 목록 맨 위의 대화를 연다. 담당자와 나눈 이야기가 위쪽에 온다.
 *
 * **구역 제목이 뜨기를 먼저 기다린다.** 목록은 두 번에 나눠 채워진다 — 방문 요청이
 * 먼저 오고 지난 대화가 뒤에 온다. 첫 그림에 대고 누르면 그 줄이 곧 다시 그려지면서
 * 누른 것이 사라진다. 실제로 방이 안 열린 채 목록만 찍혔다.
 */
async function openFirstConversation(): Promise<void> {
  const ready = await waitFor(() =>
    document.body.innerText.includes("담당자와 나눈 이야기") ? true : null,
  );
  if (!ready) return;
  await sleep(400);
  const row = await waitFor(() => byLabelEnding("와 나눈 이야기 열기"));
  row?.click();
}

/** 화면 이름에 따라 한 겹 더 열어 준다. 열 것이 없으면 아무 일도 하지 않는다. */
export async function drive(
  screen: string,
  staff: { id: string; password: string },
): Promise<void> {
  if (screen === "staff-chat") {
    await openFirstConversation();
    return;
  }
  if (screen === "admin-list") {
    await signInAsStaff(staff.id, staff.password);
    return;
  }
  if (screen === "admin-detail") {
    await signInAsStaff(staff.id, staff.password);
    await openFirstStaffRequest();
  }
}
