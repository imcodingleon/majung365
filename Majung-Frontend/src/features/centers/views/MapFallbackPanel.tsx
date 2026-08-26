// 지도를 띄우지 못했을 때 그 자리에 놓는 화면. 웹과 네이티브가 함께 쓴다.
//
// **구글이 그리는 오류 패널을 사용자에게 보이지 않는다.** 키가 막히면 구글은 그 자리에
// "죄송합니다. 문제가 발생했습니다"와 개발자용 안내를 영어 링크와 함께 그린다. 저리터러시
// 사용자에게는 앱이 고장 난 것으로만 읽힌다.
//
// **아래 목록은 그대로 살아 있다는 것을 말한다.** 지도가 안 떴다고 할 일이 없어진 것이
// 아니라, 전화를 걸고 찾아가는 길은 그대로 있다.
import { Text, View } from "react-native";

import { Icon } from "@/shared/components/Icon";
import { COLORS } from "@/shared/theme/colors";

export function MapFallbackPanel() {
  return (
    <View className="h-56 items-center justify-center gap-2 overflow-hidden rounded-2xl border border-line bg-brand-soft">
      <Icon name="pin" size={32} color={COLORS.brand} />
      <Text className="text-body font-bold text-brand">지도를 불러오지 못했어요</Text>
      <Text className="px-6 text-center text-caption text-ink-muted">
        아래 목록에서 기관을 찾고 전화하실 수 있어요
      </Text>
    </View>
  );
}
