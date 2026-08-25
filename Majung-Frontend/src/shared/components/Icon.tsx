// 화면 아이콘 (§3.9).
//
// **이모지를 걷어낸 자리다.** 이모지는 기기마다 다르게 그려진다 — 안드로이드의 🔔과
// iOS의 🔔이 다른 물건처럼 보이고, 윈도우 브라우저에서는 흑백으로 나오기도 한다.
// 저리터러시 사용자에게 그림이 곧 뜻인데 그 그림을 우리가 정하지 못하는 셈이었다.
//
// **`SectionIcon`과 같은 규칙으로 그린다** — 24×24 격자, 2px 획, 둥근 마감.
// 한 화면에 두 세트가 섞이면 굵기와 여백이 어긋나 보인다.
//
// **알아볼 수 있는 사물로 한정한다.** 추상 기호는 읽히지 않는다. 전화기·종·열쇠·
// 압정처럼 손에 잡히는 것이거나, 체크·화살표처럼 이미 뜻이 굳은 표시만 쓴다.
import Svg, { Circle, Path, Rect } from "react-native-svg";

/** 24×24 격자에 2px 획. 굵기가 흔들리면 아이콘들이 따로 논다. */
const STROKE = 2;

export type IconName =
  | "check"
  | "close"
  | "phone"
  | "bot"
  | "send"
  | "down"
  | "back"
  | "key"
  | "chat"
  | "bell"
  | "undo"
  | "checkCircle"
  | "pin"
  | "home"
  | "person";

type Props = {
  name: IconName;
  size?: number;
  color: string;
};

/** 획으로만 그리는 도형들이 공유하는 속성. 매번 적으면 한 곳이 어긋난다. */
const line = {
  strokeWidth: STROKE,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function Check({ color }: { color: string }) {
  // 체크 하나. 획 끝을 둥글려 손으로 그은 인상을 준다.
  return <Path d="m5 12.5 4.5 4.5L19 7" stroke={color} fill="none" {...line} />;
}

function Close({ color }: { color: string }) {
  return (
    <>
      <Path d="M6 6l12 12" stroke={color} {...line} />
      <Path d="M18 6 6 18" stroke={color} {...line} />
    </>
  );
}

function Phone({ color }: { color: string }) {
  // 수화기. 전화 걸기가 이 서비스에서 가장 중요한 행동이라(§5.3) 가장 또렷하게 그린다.
  return (
    <Path
      d="M7.2 3.6h2.9l1.5 3.6-1.9 1.2a11.5 11.5 0 0 0 4.9 4.9l1.2-1.9 3.6 1.5v2.9a2 2 0 0 1-2.2 2A16.8 16.8 0 0 1 5.2 5.8a2 2 0 0 1 2-2.2Z"
      stroke={color}
      fill="none"
      {...line}
    />
  );
}

function Bot({ color }: { color: string }) {
  // 로봇 얼굴. 사람이 아니라는 것을 한눈에 알려야 한다 (§6.1).
  return (
    <>
      <Rect x={4} y={8} width={16} height={11} rx={3} stroke={color} fill="none" {...line} />
      <Path d="M12 8V4.5" stroke={color} {...line} />
      <Circle cx={12} cy={3.5} r={1.2} stroke={color} fill="none" strokeWidth={STROKE} />
      {/* 눈 — 점으로 찍으면 작은 크기에서 사라진다. 짧은 획으로 둔다 */}
      <Path d="M9 12.5v1.5" stroke={color} {...line} />
      <Path d="M15 12.5v1.5" stroke={color} {...line} />
    </>
  );
}

function Send({ color }: { color: string }) {
  // 종이비행기. 보내기의 뜻이 이미 굳은 그림이다.
  return (
    <>
      <Path d="M20.5 3.5 3.5 10.2l6.6 2.6 2.6 6.6Z" stroke={color} fill="none" {...line} />
      <Path d="M20.5 3.5 10.1 12.8" stroke={color} {...line} />
    </>
  );
}

function Down({ color }: { color: string }) {
  return <Path d="M7 10.5 12 15.5l5-5" stroke={color} fill="none" {...line} />;
}

function Back({ color }: { color: string }) {
  return <Path d="M14.5 6 8.5 12l6 6" stroke={color} fill="none" {...line} />;
}

function Key({ color }: { color: string }) {
  // 열쇠. 먼저 해야 여는 항목에 붙는다 — 잠긴 것을 여는 물건이라 뜻이 그대로 통한다.
  return (
    <>
      <Circle cx={8} cy={8} r={4} stroke={color} fill="none" strokeWidth={STROKE} />
      <Path d="m11 11 8 8" stroke={color} {...line} />
      <Path d="m16.5 16.5 2-2" stroke={color} {...line} />
    </>
  );
}

function Chat({ color }: { color: string }) {
  // 말풍선. 꼬리가 있어야 대화로 읽힌다.
  return (
    <Path
      d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 4v-4h-.5A1.5 1.5 0 0 1 4 14.5Z"
      stroke={color}
      fill="none"
      {...line}
    />
  );
}

function Bell({ color }: { color: string }) {
  // 종. 미리 알린다는 뜻이다 (§7).
  return (
    <>
      <Path
        d="M6.5 16V10.5a5.5 5.5 0 0 1 11 0V16l1.5 2.5H5Z"
        stroke={color}
        fill="none"
        {...line}
      />
      <Path d="M10 21h4" stroke={color} {...line} />
    </>
  );
}

function Undo({ color }: { color: string }) {
  // 되돌아가는 화살표. 실수로 누른 완료를 물리는 자리에 쓴다 (§5.2).
  return (
    <>
      <Path d="M4.5 9.5h10a5 5 0 0 1 0 10H9" stroke={color} fill="none" {...line} />
      <Path d="M8 5 4 9.5l4 4.5" stroke={color} fill="none" {...line} />
    </>
  );
}

function CheckCircle({ color }: { color: string }) {
  // 마쳤다는 표시. 맨 체크보다 무게가 있어 "끝냈다"에 어울린다.
  return (
    <>
      <Circle cx={12} cy={12} r={8.5} stroke={color} fill="none" strokeWidth={STROKE} />
      <Path d="m8.2 12.2 2.6 2.6 5-5.2" stroke={color} fill="none" {...line} />
    </>
  );
}

function Pin({ color }: { color: string }) {
  // 지도 압정. 장소를 가리키는 뜻이 굳은 그림이다 (§5.4).
  return (
    <>
      <Path
        d="M12 21c4-4.4 6-7.6 6-10a6 6 0 1 0-12 0c0 2.4 2 5.6 6 10Z"
        stroke={color}
        fill="none"
        {...line}
      />
      <Circle cx={12} cy={11} r={2.3} stroke={color} fill="none" strokeWidth={STROKE} />
    </>
  );
}

function Home({ color }: { color: string }) {
  // 집. 지붕과 몸통, 그리고 문 하나. 문이 없으면 도형으로만 보인다.
  return (
    <>
      <Path d="M3.5 10.5 12 3.5l8.5 7" stroke={color} fill="none" {...line} />
      <Path d="M5.5 9.8V20h13V9.8" stroke={color} fill="none" {...line} />
      <Path d="M9.8 20v-5.2h4.4V20" stroke={color} fill="none" {...line} />
    </>
  );
}

function Person({ color }: { color: string }) {
  // 사람. 머리와 어깨만 그린다 — 눈코입을 넣으면 24px에서 뭉쳐 얼룩으로 보인다.
  return (
    <>
      <Circle cx={12} cy={8} r={3.6} stroke={color} fill="none" strokeWidth={STROKE} />
      <Path
        d="M4.8 20c0-3.6 3.2-5.8 7.2-5.8s7.2 2.2 7.2 5.8"
        stroke={color}
        fill="none"
        {...line}
      />
    </>
  );
}

const SHAPES: Record<IconName, (p: { color: string }) => React.ReactElement> = {
  check: Check,
  close: Close,
  phone: Phone,
  bot: Bot,
  send: Send,
  down: Down,
  back: Back,
  key: Key,
  chat: Chat,
  bell: Bell,
  undo: Undo,
  checkCircle: CheckCircle,
  pin: Pin,
  home: Home,
  person: Person,
};

export function Icon({ name, size = 24, color }: Props) {
  const Shape = SHAPES[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Shape color={color} />
    </Svg>
  );
}
