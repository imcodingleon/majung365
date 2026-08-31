// 정적 내보내기의 HTML 껍데기.
//
// **이 파일이 있는 이유는 딱 하나다.** 시연 프레임에서 저장소를 격리하는 일이 **앱
// 번들보다 먼저** 일어나야 하기 때문이다.
//
// 무엇이 문제였나
//   시연 목업은 라우트 모듈(`showcase/preview/index.tsx`)이 평가될 때 깔린다. 그런데
//   정적 배포본에서는 그 시점이 **루트 레이아웃이 이미 그려지기 시작한 뒤**다. 루트
//   레이아웃의 `RegionLookupProvider`는 첫 렌더에서 `lastPlace()`로 `localStorage`를
//   읽는데, 그때는 아직 진짜 저장소다.
//
//   배포 도메인에서는 그 저장소에 **그 브라우저가 실제로 앱을 쓰며 남긴 값**이 들어
//   있다. 그래서 지도의 지역 배지가 픽스처의 안양이 아니라 보는 사람이 실제로 있던
//   곳으로 떴다. 로컬에서는 그 값이 없어 멀쩡해 보였고, 그래서 한참 헤맸다.
//
// **여기 있는 인라인 스크립트는 번들보다 먼저 돈다.** 그래서 앱이 무엇을 읽기 전에
// 저장소를 프레임 안에서만 사는 것으로 바꿔 놓을 수 있다.
//
// **일반 라우트에는 아무 일도 하지 않는다.** 주소가 `/showcase/preview`로 시작할 때만
// 움직인다. 나머지 화면은 이 파일이 없을 때와 똑같이 뜬다.
//
// 나머지 구조는 expo-router가 만들던 기본 문서와 같다. 여기서 바꾸면 웹의 모든 화면이
// 함께 바뀌므로 스크립트 한 줄 말고는 손대지 않는다.
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * 시연 프레임 부팅 스크립트.
 *
 * 하는 일은 셋이다.
 *   ① `localStorage`·`sessionStorage`를 프레임 안에서만 사는 메모리 저장소로 바꾼다.
 *      **보는 사람의 실제 앱 기록을 읽지도, 건드리지도 않는다.**
 *   ② 백엔드로 가는 `fetch`를 목업이 깔릴 때까지 붙들어 둔다.
 *   ③ 위치를 막는다. 시연 이미지에 PPT를 만드는 사람의 위치가 박힐 이유가 없고,
 *      찍는 기계마다 화면이 달라지면 안 된다.
 *
 * **②가 없으면 실서버로 요청이 나간다.** 앱은 화면을 그리기 시작하자마자 이어서 볼
 * 것을 부르는데, 그 시점이 목업이 깔리기 전이다. 실제로 `/api/me`와 `/api/tasks`가
 * 그대로 나갔다. 여기서 붙들었다가 목업이 준비되면 그쪽으로 넘긴다.
 *
 * **값은 심지 않는다.** 토큰이나 위치를 여기서 심으면 픽스처와 같은 값을 두 곳에
 * 적어 두는 셈이고, 한쪽만 고치는 날이 온다. 값은 목업이 깔릴 때 한곳에서 넣는다
 * (`src/showcase/installMocks.ts`의 `SEEDED_STORAGE`).
 */
const SHOWCASE_BOOT = `
(function () {
  try {
    if (!location.pathname.startsWith("/showcase/preview")) return;

    var map = {};
    var store = {
      get length() { return Object.keys(map).length; },
      key: function (i) { return Object.keys(map)[i] != null ? Object.keys(map)[i] : null; },
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
      setItem: function (k, v) { map[k] = String(v); },
      removeItem: function (k) { delete map[k]; },
      clear: function () { map = {}; }
    };
    Object.defineProperty(window, "localStorage", { value: store, configurable: true });
    Object.defineProperty(window, "sessionStorage", { value: store, configurable: true });
    window.__showcaseBootStore = store;

    var realFetch = window.fetch.bind(window);
    window.__showcaseRealFetch = realFetch;
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) ? input.url : String(input);
      var path = "";
      try { path = new URL(url, location.href).pathname; } catch (e) {}
      if (path.indexOf("/api/") !== 0) return realFetch(input, init);
      return new Promise(function (resolve, reject) {
        var tries = 0;
        (function wait() {
          if (window.__showcaseFetch) { resolve(window.__showcaseFetch(input, init)); return; }
          if (++tries > 400) { reject(new Error("showcase: 목업이 준비되지 않았습니다.")); return; }
          setTimeout(wait, 25);
        })();
      });
    };

    var denied = { code: 1, message: "showcase: 위치를 쓰지 않습니다.", PERMISSION_DENIED: 1 };
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: function (_ok, fail) { if (fail) fail(denied); },
        watchPosition: function (_ok, fail) { if (fail) fail(denied); return 0; },
        clearWatch: function () {}
      }
    });
    if (navigator.permissions && navigator.permissions.query) {
      var ask = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = function (desc) {
        if (desc && desc.name === "geolocation") {
          return Promise.resolve({ state: "denied", onchange: null, addEventListener: function () {}, removeEventListener: function () {}, dispatchEvent: function () { return false; } });
        }
        return ask(desc);
      };
    }
  } catch (e) {
    // 여기서 실패해도 화면은 뜬다. 시연 데이터가 조금 어긋날 뿐이다.
  }
})();
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <ScrollViewStyleReset />
        <script dangerouslySetInnerHTML={{ __html: SHOWCASE_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
