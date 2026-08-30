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
  | "person"
  | "search"
  | "star";

type Props = {
  name: IconName;
  size?: number;
  color: string;
  /**
   * 속을 채운다. 별처럼 **켜짐과 꺼짐이 있는 표시**에만 쓴다.
   *
   * 획으로만 그리는 아이콘은 이 값을 무시한다 — 채울 면이 없다.
   */
  filled?: boolean;
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
  //
  // **피그마에서 내려받은 원본을 그대로 옮겼다** (2026-08-31 · `assets/icons/figma/phone.svg`).
  // 좌표를 다시 그리지 않고 `d` 값을 글자 그대로 가져왔기 때문에 **격자가 18×18이다.**
  // 다른 아이콘은 24×24다 — `VIEWBOX`가 이 아이콘만 따로 잡아 준다.
  // 획도 원본을 따라 1.4px인데, 18 격자의 1.4는 24 격자의 1.87에 해당해 나머지(2px)와
  // 거의 같은 굵기로 보인다.
  return (
    <Path
      d="M16.5 12.69V14.94C16.5008 15.1489 16.4581 15.3556 16.3744 15.547C16.2907 15.7384 16.168 15.9102 16.0141 16.0514C15.8601 16.1926 15.6784 16.3001 15.4806 16.367C15.2827 16.4339 15.073 16.4588 14.865 16.44C12.5571 16.1892 10.3402 15.4006 8.3925 14.1375C6.58037 12.986 5.044 11.4496 3.8925 9.6375C2.62498 7.6809 1.83618 5.45325 1.59 3.135C1.57126 2.9276 1.59591 2.71857 1.66238 2.52122C1.72884 2.32387 1.83568 2.14252 1.97607 1.98872C2.11647 1.83491 2.28735 1.71203 2.47784 1.62789C2.66833 1.54375 2.87426 1.5002 3.0825 1.5H5.3325C5.69648 1.49642 6.04934 1.62531 6.32532 1.86265C6.6013 2.09999 6.78156 2.42958 6.8325 2.79C6.92747 3.51005 7.10359 4.21705 7.3575 4.8975C7.45841 5.16594 7.48025 5.45769 7.42043 5.73816C7.36061 6.01863 7.22165 6.27608 7.02 6.48L6.0675 7.4325C7.13517 9.31016 8.68984 10.8648 10.5675 11.9325L11.52 10.98C11.7239 10.7784 11.9814 10.6394 12.2618 10.5796C12.5423 10.5198 12.8341 10.5416 13.1025 10.6425C13.783 10.8964 14.49 11.0725 15.21 11.1675C15.5743 11.2189 15.9071 11.4024 16.1449 11.6831C16.3827 11.9638 16.5091 12.3222 16.5 12.69Z"
      stroke={color}
      fill="none"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
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

function Search({ color }: { color: string }) {
  // 돋보기. 원과 손잡이. 찾는다는 뜻이 굳은 그림이다.
  return (
    <>
      <Circle cx={11} cy={11} r={6.5} stroke={color} fill="none" strokeWidth={STROKE} />
      <Path d="M15.8 15.8 20.5 20.5" stroke={color} fill="none" {...line} />
    </>
  );
}

function Star({ color, filled }: { color: string; filled?: boolean }) {
  // 별. 즐겨찾기. **채우면 켜진 것이다** — 획만으로는 켜짐과 꺼짐이 구분되지 않는다.
  return (
    <Path
      d="M12 3.8l2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.85z"
      stroke={color}
      fill={filled ? color : "none"}
      {...line}
    />
  );
}

const SHAPES: Record<
  IconName,
  (p: { color: string; filled?: boolean }) => React.ReactElement
> = {
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
  search: Search,
  star: Star,
};

/**
 * 격자가 24×24가 아닌 아이콘.
 *
 * **피그마에서 내려받은 원본을 좌표째 옮긴 것들이다.** 좌표를 24 격자로 다시 계산해
 * 옮겨 적으면 그 과정에서 틀릴 수 있어서, `d` 값을 글자 그대로 두고 격자를 여기서
 * 맞춰 준다. 화면에 나오는 크기는 `size`가 정하므로 격자가 달라도 나란히 놓인다.
 */
const VIEWBOX: Partial<Record<IconName, string>> = {
  phone: "0 0 18 18",
};

export function Icon({ name, size = 24, color, filled }: Props) {
  const Shape = SHAPES[name];
  return (
    <Svg width={size} height={size} viewBox={VIEWBOX[name] ?? "0 0 24 24"} fill="none">
      <Shape color={color} filled={filled} />
    </Svg>
  );
}
