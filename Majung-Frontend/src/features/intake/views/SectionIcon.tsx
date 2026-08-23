// 상황 알아보기 6분야 아이콘 (§3.7).
//
// PNG 대신 벡터로 그린다. 이유가 셋이다.
//   - **색이 상태를 따라간다.** 아직 답하지 않음·다 답함이 색으로 갈리는데, PNG는 색을 못 바꾼다
//   - 큰 글씨 설정으로 아이콘이 커져도 뭉개지지 않는다
//   - 여섯 개의 굵기와 여백이 한 파일 안에 있어 서로 어긋나지 않는다
//
// **그림은 알아볼 수 있는 사물로 한정한다.** 저리터러시 사용자에게 추상 기호는 읽히지 않는다.
// 집·지갑·신분증·가방·심장·방패까지 전부 손에 잡히는 물건이다.
import Svg, { Circle, Path, Rect } from "react-native-svg";

import type { SectionId } from "../domain/sections";

type Props = {
  id: SectionId;
  size?: number;
  color: string;
};

/** 24×24 격자에 2px 획으로 통일한다. 굵기가 흔들리면 여섯 개가 따로 논다. */
const STROKE = 2;

function Housing({ color }: { color: string }) {
  return (
    <>
      {/* 지붕 — 꼭짓점을 살짝 둥글려 딱딱한 인상을 덜어낸다 */}
      <Path
        d="M3 10.2 12 3.5l9 6.7"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5.2 11.8V20h13.6v-8.2"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 문 — 집이라는 것을 결정짓는 부분이다. 창문보다 문이 먼저 읽힌다 */}
      <Path
        d="M10 20v-5h4v5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function Living({ color }: { color: string }) {
  return (
    <>
      {/* 지갑. 돈 그림(동전·지폐)은 액수로 읽힐 여지가 있어 담는 물건으로 바꿨다 */}
      <Rect
        x={3}
        y={6.5}
        width={18}
        height={13}
        rx={3}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path
        d="M3 10.5h12.5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        opacity={0.45}
      />
      {/* 덮개와 잠금 */}
      <Path
        d="M17 6.5V5a1.5 1.5 0 0 0-1.9-1.45L5.2 6.1"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={16.5} cy={13} r={1.6} fill={color} />
    </>
  );
}

function Identity({ color }: { color: string }) {
  return (
    <>
      {/* 신분증. 사진 자리와 글줄이 함께 있어야 서류로 읽힌다 */}
      <Rect
        x={2.5}
        y={5}
        width={19}
        height={14}
        rx={3}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Circle cx={8.5} cy={10.8} r={2.2} stroke={color} strokeWidth={STROKE} />
      <Path
        d="M5.4 15.8c.5-1.5 1.7-2.3 3.1-2.3s2.6.8 3.1 2.3"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
      />
      <Path d="M14.6 10h4.2M14.6 13.5h4.2" stroke={color} strokeWidth={STROKE} strokeLinecap="round" opacity={0.45} />
    </>
  );
}

function Employment({ color }: { color: string }) {
  return (
    <>
      {/* 일하러 들고 나가는 가방. 손잡이가 있어야 사무·현장 양쪽으로 읽힌다 */}
      <Rect
        x={2.5}
        y={7.5}
        width={19}
        height={12.5}
        rx={3}
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path
        d="M9 7.5V5.8A1.8 1.8 0 0 1 10.8 4h2.4A1.8 1.8 0 0 1 15 5.8v1.7"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M2.5 12.8h19" stroke={color} strokeWidth={STROKE} opacity={0.45} />
      <Rect x={10.2} y={11.2} width={3.6} height={3.2} rx={1} fill={color} />
    </>
  );
}

function Health({ color }: { color: string }) {
  return (
    <>
      {/* 심장. 몸과 마음을 한 분야가 함께 다루므로 병원 기호(십자)를 쓰지 않았다 */}
      <Path
        d="M12 20s-7.6-4.6-7.6-9.7A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.6 2.9C19.6 15.4 12 20 12 20Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      {/* 맥박선 — 살아 움직인다는 표시다 */}
      <Path
        d="M6.6 12.4h2.6l1.4-2.4 1.9 4.3 1.4-1.9h2.5"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function Rights({ color }: { color: string }) {
  return (
    <>
      {/* 방패. 옛 아이콘은 채무만 가리켰는데 이 분야는 권리를 지키는 일 전체를 담는다 */}
      <Path
        d="M12 3.2 4.8 6v6.1c0 4.3 3 7.5 7.2 8.7 4.2-1.2 7.2-4.4 7.2-8.7V6L12 3.2Z"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinejoin="round"
      />
      <Path
        d="m8.8 12.1 2.2 2.2 4.2-4.4"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

const SHAPES: Record<SectionId, (p: { color: string }) => React.ReactElement> = {
  housing: Housing,
  living: Living,
  identity: Identity,
  employment: Employment,
  health: Health,
  rights: Rights,
};

export function SectionIcon({ id, size = 28, color }: Props) {
  const Shape = SHAPES[id];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Shape color={color} />
    </Svg>
  );
}
