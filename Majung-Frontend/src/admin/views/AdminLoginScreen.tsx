// 담당자 로그인 (§8.3).
//
// ⚠️ **인증이 아니다.** 화면에서도 그 사실을 밝힌다. 나중에 이 화면을 본 사람이
// 진짜 인증이라고 오해하면 안 된다.
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NoteBox, NoteLine } from "@/shared/components/NoteBox";
import { COLORS } from "@/shared/theme/colors";

type Props = {
  /** 실패 문구. 서버가 준 말을 그대로 낸다. 없으면 null. */
  error: string | null;
  /** 서버에 묻는 중. 두 번 누르는 것을 막는다. */
  busy?: boolean;
  /** 손을 놓아 스스로 닫혔을 때. 왜 나갔는지 알려준다. */
  timedOut: boolean;
  onSignIn: (id: string, password: string) => void;
};

export function AdminLoginScreen({ error, busy, timedOut, onSignIn }: Props) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");

  const box =
    "rounded-xl border-[1.5px] border-line bg-white px-4 py-4 text-body-lg text-ink-strong";
  const ready = id.trim().length > 0 && password.length > 0;

  return (
    <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
      <View className="flex-1 justify-center px-6">
        {/* **로그인은 이제 진짜다.** 서버가 확인하고 계정도 발급되어 있다.
            아직 예시인 것은 요청 목록뿐이라 배너를 그만큼만 남긴다. 실제 자료가 붙으면 지운다. */}
        <NoteBox tone="warn" title="아직 준비 중인 화면입니다" className="mb-8">
          <NoteLine tone="warn">로그인은 실제로 동작하지만 요청 목록은 예시입니다.</NoteLine>
        </NoteBox>

        <Text className="text-display font-extrabold text-ink-strong">
          담당자 화면
        </Text>
        <Text className="mb-8 mt-2 text-body-lg text-ink-sub">
          공단·행정복지센터 담당자용입니다.
        </Text>

        <Text className="mb-2 text-body-lg font-extrabold text-ink-strong">아이디</Text>
        <TextInput
          className={box}
          value={id}
          onChangeText={(t) => setId(t)}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="아이디"
          placeholderTextColor={COLORS.inkMuted}
          accessibilityLabel="아이디"
        />

        <Text className="mb-2 mt-5 text-body-lg font-extrabold text-ink-strong">비밀번호</Text>
        <TextInput
          className={box}
          value={password}
          onChangeText={(t) => setPassword(t)}
          secureTextEntry
          autoCapitalize="none"
          placeholder="비밀번호"
          placeholderTextColor={COLORS.inkMuted}
          accessibilityLabel="비밀번호"
        />

        {/* 아이디가 틀렸는지 비밀번호가 틀렸는지 구분해 알리지 않는다. 구분하면 존재하는
            아이디를 찾아내는 길이 된다 — 서버가 그렇게 응답하고 화면도 그대로 낸다 */}
        {error ? (
          <View className="mt-4 rounded-xl border border-alert-line bg-alert-soft px-4 py-4">
            <Text className="text-body text-alert-ink">{error}</Text>
          </View>
        ) : null}

        {timedOut ? (
          <View className="mt-4 rounded-xl border border-note-warn-line bg-note-warn px-4 py-4">
            <Text className="text-body text-note-warn-ink">
              한동안 쓰지 않아 자동으로 나갔습니다. 다시 들어와 주세요.
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => onSignIn(id, password)}
          disabled={!ready || busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready || busy, busy }}
          accessibilityLabel="들어가기"
          className="mt-6 items-center rounded-2xl py-4 active:opacity-90"
          style={{ backgroundColor: ready && !busy ? COLORS.brand : COLORS.brandMuted }}
        >
          <Text className="text-body-lg font-extrabold text-white">
            {busy ? "확인하는 중이에요" : "들어가기"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
