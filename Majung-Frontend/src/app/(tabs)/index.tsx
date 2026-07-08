import { Text, View } from "react-native";

// 홈 탭 — Non-goal: 껍데기만(기능 없음). 탭/버튼은 존재하되 착지·서비스 그리드 기능은 만들지 않는다.
export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white px-6">
      <Text className="text-2xl font-bold text-neutral-800">마중365</Text>
      <Text className="mt-2 text-base text-neutral-500">홈 (예선 범위 밖 · 껍데기)</Text>
    </View>
  );
}
