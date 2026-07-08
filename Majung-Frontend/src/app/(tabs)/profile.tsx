import { Text, View } from "react-native";

// 내 정보 탭 — 네비 구성용. 예선은 계정/로그인 없음(Non-goal) → 안내·정적 정보만.
export default function ProfileScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-xl font-bold text-neutral-800">내 정보</Text>
      <Text className="mt-2 text-base text-neutral-500">익명 사용 · 로그인 없음</Text>
    </View>
  );
}
