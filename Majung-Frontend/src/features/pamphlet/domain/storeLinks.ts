// 팜플렛에 실을 설치용 QR 주소 (§2.2·§2.7).
//
// QR을 스캔하면 스토어로 간다. 그것으로 끝이다. 앱 안에서 QR을 다시 스캔하는 절차는 없다.
//
// QR을 둘로 나누는 이유는 QR 하나에 주소 하나만 담기기 때문이다. 중간에 OS를 판별하는
// 웹페이지를 두면 하나로 되지만 그 주소와 페이지를 따로 관리해야 한다. 둘이 더 단순하다.

export type StoreLink = {
  /** 화면에 보이는 이름. 자기 폰이 어느 쪽인지 모르는 사용자를 위해 제조사 이름을 함께 낸다. */
  label: string;
  /** 어떤 폰인지 알아볼 수 있게 붙이는 보조 설명. */
  hint: string;
  /** QR에 담을 주소. 아직 없으면 null이다. */
  url: string | null;
  /** 주소가 없는 이유. 화면에 그대로 보여준다. */
  pendingReason?: string;
};

/** 패키지명은 app.json의 `expo.android.package`와 같아야 한다. 스토어 등록 자산이 여기 묶여 있다. */
const ANDROID_PACKAGE = "com.superbuilders.majung365";

export const STORE_LINKS: readonly StoreLink[] = [
  {
    label: "안드로이드 폰",
    hint: "삼성, LG 같은 폰이에요",
    // 패키지명만 알면 지금 만들 수 있다. 이미 정해져 있다 (§2.7).
    url: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
  },
  {
    label: "아이폰",
    hint: "애플에서 만든 폰이에요",
    // 앱 ID는 App Store Connect에 앱을 등록해야 부여된다. 심사 통과 전이라도 앱을 만들면
    // ID가 나오므로 그 시점 이후에 이 값을 채운다 (§2.7 · §12-6).
    url: null,
    pendingReason: "앱 등록이 끝나면 넣을 수 있어요",
  },
];
