// 동의 영역 (§3.4). 가입 화면 하단, 시작하기 버튼 바로 위에 놓인다.
//
// **여기만 다른 화면과 형식이 다르다.** 동의란은 법적 효력이 걸린 자리이고, 사용자가 다른
// 서비스에서 이미 익힌 형식이 따로 있다. [필수]·[선택] 표시, 전체 동의가 맨 위, 항목마다
// 전문 보기가 오른쪽에 붙는 배치가 그것이다. 그 형식을 깨면 오히려 무엇에 동의하는 것인지
// 알아보기 어려워진다.
//
// 항목마다 한 줄 설명을 아래에 붙인다. 항목명은 형식을 맡고 그 아래 한 줄이 뜻을 맡는다.
//
// **2026-08-31에 그 한 줄도 시안 문구로 바꿨다.** 전에는 "…모으고 쓰는 데 동의해요"처럼
// 풀어 쓴 말이었고 지금은 "…수집 및 이용에 동의합니다"다. 저리터러시를 이유로 풀어 쓴
// 결정을 뒤집은 것이며, 근거는 디자이너 시안 채택이다 (`copy-voice.md`).
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/shared/components/Icon";

import { COLORS } from "@/shared/theme/colors";

import {
  type ConsentId,
  type ConsentState,
  type CrimeCategoryId,
  visibleConsents,
} from "../domain/signup";

type Props = {
  crime: CrimeCategoryId | null;
  state: ConsentState;
  onToggle: (id: ConsentId) => void;
  onToggleAll: (next: boolean) => void;
  onOpenDetail: (id: ConsentId) => void;
  /**
   * 위치 동의를 켠 뒤의 상태 한 줄. 알아낸 곳이거나, 알아보는 중이거나, 실패한 이유다.
   *
   * **체크만 되고 아무 표시가 없으면 사용자는 무엇이 됐는지 모른다.** 기기 권한 팝업은
   * 화면 밖에서 뜨고 사라지므로, 그 결과가 화면 안에 남아야 한다.
   */
  locationNote?: string | null;
};

function CheckBox({ checked, large }: { checked: boolean; large?: boolean }) {
  return (
    <View
      className={`${large ? "size-7" : "size-6"} items-center justify-center rounded-md border-2`}
      style={{
        backgroundColor: checked ? COLORS.brand : COLORS.surface,
        borderColor: checked ? COLORS.brand : COLORS.brandMuted,
      }}
    >
      {checked ? (
        <Icon name="check" size={large ? 18 : 14} color={COLORS.surface} />
      ) : null}
    </View>
  );
}

export function ConsentSection({
  crime,
  state,
  onToggle,
  onToggleAll,
  onOpenDetail,
  locationNote,
}: Props) {
  const items = visibleConsents(crime);
  // "전체 동의"를 눌러도 각 항목이 개별로 체크된 상태가 그대로 보여야 한다 (§3.4-5).
  const allChecked = items.every((c) => state[c.id]);

  return (
    <View className="overflow-hidden rounded-2xl border-[1.5px] border-line bg-white">
      {/* 전체 동의가 맨 위에 온다. 개별 항목을 다 읽은 뒤에 나오면 이미 하나씩 누른 다음이다 */}
      <Pressable
        onPress={() => onToggleAll(!allChecked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allChecked }}
        accessibilityLabel="약관 전체 동의"
        className="flex-row items-center gap-3 bg-white px-4 py-4 active:opacity-80"
      >
        <CheckBox checked={allChecked} large />
        {/* 눌러도 바탕색과 글자색이 바뀌지 않는다 (2026-08-31 시안). 체크 상자 하나가
            켜짐을 맡는다 — 줄 전체가 파랗게 물들면 아래 항목들과 층이 어긋나 보인다 */}
        <Text className="flex-1 text-body-lg font-bold text-ink-strong">약관 전체 동의</Text>
      </Pressable>

      <View className="border-t border-line" />

      {items.map((item, index) => (
        <View
          key={item.id}
          className="px-4 py-4"
          style={{
            borderTopWidth: index === 0 ? 0 : 1,
            borderTopColor: COLORS.line,
          }}
        >
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => onToggle(item.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: state[item.id] }}
              accessibilityLabel={`${item.required ? "필수" : "선택"} ${item.label}`}
              className="flex-1 flex-row items-center gap-3 active:opacity-70"
            >
              <CheckBox checked={state[item.id]} />
              <Text className="flex-1 text-body font-semibold text-ink-strong">
                <Text style={{ color: item.required ? COLORS.brand : COLORS.inkSub }}>
                  {/* **"[필수]"로 되돌렸다** (2026-08-31 시안 채택). §3.4-2는 법률 용어를
                      그대로 내면 저리터러시 사용자가 겁먹는다며 "꼭 필요해요 · "로 풀어
                      두었는데, 그 결정을 뒤집는다. 뜻은 아래 한 줄이 계속 맡는다. */}
                  {item.required ? "[필수] " : "[선택] "}
                </Text>
                <Text>{item.label}</Text>
              </Text>
            </Pressable>

            <Pressable
              onPress={() => onOpenDetail(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} 전문 보기`}
              className="px-2 py-2 active:opacity-60"
            >
              {/* 문구를 "보기"로 줄였다. "전문 보기"는 좁은 화면에서 항목명을 두 줄로 밀어낸다.
                  무엇을 보는 것인지는 낭독기용 라벨이 온전히 말한다. */}
              <Text className="text-caption font-semibold text-ink-muted">보기 ›</Text>
            </Pressable>
          </View>

          {/* 항목명은 형식을 맡고 이 줄이 뜻을 맡는다 */}
          <Text className="ml-9 mt-1 text-caption font-medium text-ink-hint">{item.plain}</Text>

          {item.limitNote ? (
            <Text className="ml-9 mt-2 text-caption text-ink-muted">
              {item.limitNote}
            </Text>
          ) : null}

          {item.id === "location" && locationNote ? (
            <Text
              className="ml-9 mt-2 text-caption font-bold"
              style={{ color: COLORS.brand }}
            >
              {locationNote}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}
