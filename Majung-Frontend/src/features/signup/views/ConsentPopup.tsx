// 동의 항목의 전문 (§3.4).
//
// 화면을 이동시키지 않는다. 되돌아오는 과정에서 사용자가 혼란을 겪는다는 §5의 원칙을 여기에도
// 그대로 적용한다.
//
// **이 화면은 약관이다.** 다른 화면의 쉬운 말 원칙을 여기까지 밀고 오지 않는다. 동의 전문은
// 「개인정보 보호법」이 요구하는 고지 항목(목적·항목·기간·거부권과 불이익)을 그 순서와
// 형식대로 갖춰야 하고, 그것이 사용자를 보호하는 방식이다. 쉬운 말은 동의란 목록의
// 한 줄 설명이 맡는다.
//
// ⚠️ **본문은 법률 검토 대기 상태다.** 항목 구성과 형식은 법정 고지 요건을 따랐으나,
// 문구 확정은 검토를 거쳐야 한다. 검토가 끝나면 이 파일의 CLAUSES 값만 교체한다.
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { ConsentId } from "../domain/signup";

type Props = {
  /** 열려 있는 동의 항목. 닫혀 있으면 null. */
  consentId: ConsentId | null;
  onClose: () => void;
};

/** 한 조항. 번호는 그리는 쪽이 붙인다. */
type Clause = { title: string; lines: readonly string[] };

// 제목은 동의란의 항목명과 같은 말이어야 한다. 목록에서 누른 것과 열린 화면의 제목이 다르면
// 다른 문서를 연 것으로 읽힌다.
const TITLES: Record<ConsentId, string> = {
  privacy: "개인정보 수집·이용 동의",
  crime: "민감정보 수집·이용 동의",
  share: "개인정보 제3자 제공 동의",
};

/** 근거 법령. 무엇에 따른 고지인지가 맨 앞에 온다. */
const BASIS: Record<ConsentId, string> = {
  privacy: "「개인정보 보호법」 제15조에 따라 아래와 같이 개인정보를 수집·이용합니다.",
  crime: "「개인정보 보호법」 제23조에 따라 아래와 같이 민감정보를 수집·이용합니다.",
  share: "「개인정보 보호법」 제17조에 따라 아래와 같이 개인정보를 제3자에게 제공합니다.",
};

const CLAUSES: Record<ConsentId, readonly Clause[]> = {
  privacy: [
    {
      title: "수집·이용 목적",
      lines: [
        "이용자별 지원 항목 판정 및 맞춤 안내 제공",
        "담당 기관 연계 및 방문 예약 처리",
      ],
    },
    {
      title: "수집 항목",
      lines: ["필수: 성명, 생년월일, 출소일, 상황 알아보기 답변"],
    },
    {
      title: "보유 및 이용 기간",
      lines: [
        "마지막 접속일부터 1년. 기간이 지나면 지체 없이 파기합니다.",
        "이용자가 삭제를 요청하시면 즉시 파기합니다.",
      ],
    },
    {
      title: "동의를 거부하실 권리 및 거부에 따른 불이익",
      lines: [
        "동의를 거부하실 수 있습니다.",
        "다만 위 항목은 서비스 제공에 반드시 필요한 정보이므로, 동의하지 않으시면 서비스를 이용하실 수 없습니다.",
      ],
    },
  ],
  crime: [
    {
      title: "수집·이용 목적",
      lines: [
        "취업이 제한되는 직종 확인",
        "이용자에게 열려 있는 지원 제도 확인",
      ],
    },
    {
      // 화면은 쉬운 말을 지키고 동의 전문은 명확성을 얻는다. 제도명을 다루는 규칙 ②와 같은 방식이다.
      title: "수집 항목",
      lines: [
        "범죄경력에 관한 정보 (대분류에 한하며, 구체적인 죄명·형량은 수집하지 않습니다.)",
      ],
    },
    {
      title: "보유 및 이용 기간",
      lines: [
        "마지막 접속일부터 1년. 기간이 지나면 지체 없이 파기합니다.",
        "이 항목만 따로 보관하며, 동의를 철회하시면 이 항목만 즉시 파기합니다.",
      ],
    },
    {
      title: "동의를 거부하실 권리 및 거부에 따른 불이익",
      lines: [
        "동의를 거부하실 수 있으며, 거부하셔도 서비스를 이용하실 수 있습니다.",
        "가입 화면에서 “말하고 싶지 않아요”를 선택하시면 이 정보를 수집하지 않습니다.",
        "다만 취업 관련 안내의 정확도가 낮아질 수 있습니다.",
      ],
    },
  ],
  share: [
    {
      title: "제공받는 자",
      lines: ["한국법무보호복지공단"],
    },
    {
      title: "제공 목적",
      lines: ["방문 예약 접수 및 상담 준비"],
    },
    {
      title: "제공 항목",
      lines: ["성명, 방문 희망 일시, 방문 목적"],
    },
    {
      title: "제공받는 자의 보유 및 이용 기간",
      lines: ["제공 목적을 달성할 때까지"],
    },
    {
      title: "동의를 거부하실 권리 및 거부에 따른 불이익",
      lines: [
        "이 항목은 선택 사항이므로 거부하셔도 서비스를 이용하실 수 있습니다.",
        "다만 담당자에게 방문을 미리 알리는 기능을 이용하실 수 없습니다.",
        "동의 여부는 언제든지 다시 정하실 수 있습니다.",
      ],
    },
  ],
};

export function ConsentPopup({ consentId, onClose }: Props) {
  const clauses = consentId ? CLAUSES[consentId] : [];

  return (
    <Modal
      visible={consentId !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
        <View className="flex-row items-center justify-between border-b border-line px-5 py-4">
          <Text className="flex-1 pr-2 text-heading font-extrabold text-ink-strong">
            {consentId ? TITLES[consentId] : ""}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="닫기"
            className="size-10 items-center justify-center rounded-full active:opacity-70"
          >
            <Text className="text-2xl text-ink-muted">✕</Text>
          </Pressable>
        </View>

        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-12 pt-5">
          <Text className="mb-6 text-body text-ink-sub">
            {consentId ? BASIS[consentId] : ""}
          </Text>

          {clauses.map((clause, index) => (
            <View key={clause.title} className="mb-6">
              <Text className="mb-3 text-body-lg font-extrabold text-ink-strong">
                {index + 1}. {clause.title}
              </Text>
              {clause.lines.map((line) => (
                <View key={line} className="mb-2 flex-row pl-1">
                  <Text className="w-4 text-body text-ink-body">·</Text>
                  <Text className="flex-1 text-body text-ink-body">{line}</Text>
                </View>
              ))}
            </View>
          ))}

          <View className="mt-2 border-t border-line pt-5">
            <Text className="text-caption text-ink-muted">
              수집한 정보는 암호화하여 보관하며, 이용자는 언제든지 열람·정정·삭제를 요청하실 수
              있습니다.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
