// 마중365 워드마크 로고(가로형, 투명 배경). 헤더/네비 공용.
import { Image } from "expo-image";

const LOGO = require("../../../assets/images/logo.png");
const ASPECT = 256 / 102; // 원본 비율

export function Logo({ height = 26 }: { height?: number }) {
  return <Image source={LOGO} style={{ height, width: height * ASPECT }} contentFit="contain" />;
}
