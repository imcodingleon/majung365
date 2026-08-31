// 파란 안내 상자 (2026-08-31 시안).
//
// **`NoteBox`와 다른 자리다.** `NoteBox`는 문장 하나를 감싸는 작은 쪽지이고, 이쪽은
// 제목과 두어 줄을 담아 화면의 한 구역을 이룬다. 방문 예약 시트와 내 정보 화면이
// 같은 모양을 쓰기 때문에 여기로 올렸다.
import { Text, View } from "react-native";

import { COLORS } from "@/shared/theme/colors";
import { FONTS } from "@/shared/theme/fonts";

import { Icon, type IconName } from "./Icon";

export function InfoPanel({
  title,
  icon,
  children,
}: {
  /** 없으면 그림과 글이 한 줄에 나란히 선다. */
  title?: string;
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <View
      className="rounded-xl border p-4"
      style={{ backgroundColor: COLORS.noteInfo, borderColor: COLORS.noteInfoLine }}
    >
      {title ? (
        <>
          <View className="mb-2 flex-row items-center gap-1">
            <Icon name={icon} size={24} color={COLORS.brand} />
            <Text
              style={{ fontSize: 17, lineHeight: 27, fontFamily: FONTS.bold, color: COLORS.brand }}
            >
              {title}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 15,
              lineHeight: 25,
              fontFamily: FONTS.medium,
              color: COLORS.noteInfoInk,
            }}
          >
            {children}
          </Text>
        </>
      ) : (
        // 제목이 없으면 그림이 글 옆에 나란히 선다. 위에 얹으면 두 줄짜리 글이
        // 그림 아래로 들어가 어긋난다.
        <View className="flex-row items-start gap-1">
          <Icon name={icon} size={24} color={COLORS.brand} />
          <Text
            className="flex-1"
            style={{ fontSize: 14.5, lineHeight: 24, fontFamily: FONTS.bold, color: COLORS.brand }}
          >
            {children}
          </Text>
        </View>
      )}
    </View>
  );
}
