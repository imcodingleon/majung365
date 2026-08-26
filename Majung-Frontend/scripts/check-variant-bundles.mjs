// 번들에 무엇이 실렸는지 센다 (스펙 §7).
//
// **Git Bash의 grep을 쓰지 않는 이유가 있다.** 한글을 인코딩 때문에 놓쳐서
// "없다"는 잘못된 결과를 낸다. 실제로 그렇게 한 번 속았다. Node는 UTF-8을
// 그대로 읽으므로 여기서 센다.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// **고른 기준이 있다.** 담당자 앱에는 `src/admin`·`src/shared`·`src/features/visit`가
// 함께 실리므로, 그 계층에 있는 말은 골라도 아무것도 가리지 못한다. 아래 넷은
// 2026-08-26에 확인했고 각각 한 파일에만 있다.

/** 담당자 화면에만 있는 말. 둘 다 `src/admin/views/AdminLoginScreen.tsx`에 있다. */
const ADMIN_MARKS = ["들어가기", "확인하는 중이에요"];

/** 출소자 라우트에만 있는 말. `src/app/signup.tsx`와 `src/app/(tabs)/alerts.tsx`에 있다. */
const USER_MARKS = ["적어 주신 내용을 다시 확인해 주세요.", "알림 목록으로 돌아가기"];

const MODES = {
  // 출소자 앱: 담당자 말이 하나도 없어야 한다
  user: { forbid: ADMIN_MARKS, require: USER_MARKS },
  // 담당자 앱: 출소자 말이 하나도 없어야 한다
  admin: { forbid: USER_MARKS, require: ADMIN_MARKS },
  // 시연 대체 경로용 웹: 둘 다 있어야 한다
  web: { forbid: [], require: [...ADMIN_MARKS, ...USER_MARKS] },
};

const [distDir, mode] = process.argv.slice(2);
if (!distDir || !MODES[mode]) {
  console.error("사용법: node scripts/check-variant-bundles.mjs <dist경로> <user|admin|web>");
  process.exit(2);
}

const jsDir = join(distDir, "_expo", "static", "js", "web");
const bundles = readdirSync(jsDir).filter((f) => f.endsWith(".js"));
if (bundles.length === 0) {
  console.error(`번들을 찾지 못했다: ${jsDir}`);
  process.exit(2);
}

const text = bundles.map((f) => readFileSync(join(jsDir, f), "utf8")).join("\n");
console.log(`번들 ${bundles.length}개, ${text.length.toLocaleString()}자 (${mode})`);

const { forbid, require: needed } = MODES[mode];
let failed = false;

for (const mark of forbid) {
  const n = text.split(mark).length - 1;
  console.log(`  없어야 함  ${mark}  → ${n}`);
  if (n > 0) failed = true;
}
for (const mark of needed) {
  const n = text.split(mark).length - 1;
  console.log(`  있어야 함  ${mark}  → ${n}`);
  if (n === 0) failed = true;
}

console.log(failed ? "실패" : "통과");
process.exit(failed ? 1 : 0);
