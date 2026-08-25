// 동의 영역 (§3.4). 가입 화면 하단, 시작하기 버튼 바로 위에 놓인다.
//
// **여기만 다른 화면과 형식이 다르다.** 동의란은 법적 효력이 걸린 자리이고, 사용자가 다른
// 서비스에서 이미 익힌 형식이 따로 있다. [필수]·[선택] 표시, 전체 동의가 맨 위, 항목마다
// 전문 보기가 오른쪽에 붙는 배치가 그것이다. 그 형식을 깨면 오히려 무엇에 동의하는 것인지
// 알아보기 어려워진다.
//
// 대신 항목마다 쉬운 말 한 줄을 아래에 붙여 저리터러시 원칙을 지킨다. 항목명은 형식을 맡고
// 그 아래 한 줄이 뜻을 맡는다.
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
        className="flex-row items-center gap-3 px-4 py-4 active:opacity-80"
        style={{ backgroundColor: allChecked ? COLORS.brandSoft : COLORS.surface }}
      >
        <CheckBox checked={allChecked} large />
        <Text
          className="flex-1 text-body-lg font-extrabold"
          style={{ color: allChecked ? COLORS.brand : COLORS.inkStrong }}
        >
          약관 전체 동의
        </Text>
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
              <Text className="flex-1 text-body text-ink-strong">
                <Text
                  className="font-extrabold"
                  style={{ color: item.required ? COLORS.brand : COLORS.inkSub }}
                >
                  {/* §3.4-2 — 화면 표기는 "[필수]"가 아니라 "꼭 필요해요"다.
                      법률 용어를 그대로 내면 저리터러시 사용자가 읽고 겁먹는다. */}
                  {item.required ? "꼭 필요해요 · " : "[선택] "}
                </Text>
                <Text className="font-bold">{item.label}</Text>
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
              <Text className="text-caption font-bold text-ink-muted">보기 ›</Text>
            </Pressable>
          </View>

          {/* 항목명은 형식을 맡고 이 줄이 뜻을 맡는다 */}
          <Text className="ml-9 mt-1 text-caption text-ink-sub">{item.plain}</Text>

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
