// 동의 항목의 "보러가기" 팝업 (§3.4).
//
// 화면을 이동시키지 않는다. 되돌아오는 과정에서 사용자가 혼란을 겪는다는 §5의 원칙을 여기에도
// 그대로 적용한다.
//
// ⚠️ **본문은 법률 검토 대기 상태다.** 아래는 들어가야 할 항목의 목록이지 완성된 문구가 아니다.
// 검토가 끝나면 이 파일의 SECTIONS 값만 교체한다.
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { ConsentId } from "../domain/signup";

type Props = {
  /** 열려 있는 동의 항목. 닫혀 있으면 null. */
  consentId: ConsentId | null;
  onClose: () => void;
};

type Block = { heading: string; lines: readonly string[] };

// 제목은 동의란의 항목명과 같은 말이어야 한다. 목록에서 누른 것과 열린 화면의 제목이 다르면
// 다른 문서를 연 것으로 읽힌다.
const TITLES: Record<ConsentId, string> = {
  privacy: "개인정보 수집·이용 동의",
  crime: "민감정보 수집·이용 동의",
  share: "개인정보 제3자 제공 동의",
};

// 법령 조문을 그대로 옮겨 붙이지 않는다. 쉬운 말과 큰 글씨가 원칙이다 (§3.4).
const BLOCKS: Record<ConsentId, readonly Block[]> = {
  privacy: [
    { heading: "무엇을 받나요", lines: ["이름", "생일", "출소한 날짜", "체크하신 서류 목록"] },
    {
      heading: "어디에 쓰나요",
      lines: ["할 일 목록을 만드는 데 써요.", "담당자와 만날 날을 정하는 데 써요."],
    },
    { heading: "얼마나 오래 가지고 있나요", lines: ["마지막으로 앱을 쓰신 날부터 1년이에요."] },
    {
      heading: "지우고 싶으면",
      lines: ["언제든지 지워 달라고 하시면 바로 지워요.", "1년이 지나도 저절로 지워져요."],
    },
    {
      heading: "동의하지 않아도 되나요",
      lines: ["동의하지 않으셔도 돼요.", "다만 그러면 이 서비스를 쓰실 수 없어요."],
    },
  ],
  crime: [
    {
      heading: "무엇을 받나요",
      lines: [
        "어떤 일로 계셨는지 큰 갈래만 받아요.",
        "자세한 것은 받지 않아요.",
        // 화면은 쉬운 말을 지키고 동의는 명확성을 얻는다. 제도명을 다루는 규칙 ②와 같은 방식이다.
        "법에서는 이것을 ‘범죄경력에 관한 정보’라고 불러요.",
      ],
    },
    {
      heading: "어디에 쓰나요",
      lines: [
        "할 수 없는 일이 있는지 확인하는 데 써요.",
        "받을 수 있는 지원이 있는지 확인하는 데 써요.",
      ],
    },
    {
      heading: "동의하지 않아도 되나요",
      lines: [
        "동의하지 않으셔도 서비스를 쓰실 수 있어요.",
        "앞 질문에서 “말하고 싶지 않아요”를 고르시면 돼요.",
        "다만 일자리 안내는 조금 덜 자세할 수 있어요.",
      ],
    },
  ],
  share: [
    {
      heading: "누구에게 알려주나요",
      lines: ["한국법무보호복지공단의 담당자예요."],
    },
    {
      heading: "언제 알려주나요",
      lines: ["방문을 미리 알릴 때만 알려줘요.", "그 전에는 알려주지 않아요."],
    },
    {
      heading: "동의하지 않아도 되나요",
      lines: [
        "동의하지 않으셔도 서비스를 쓰실 수 있어요.",
        "다만 담당자에게 방문을 미리 알릴 수 없어요.",
        "나중에 다시 정하실 수 있어요.",
      ],
    },
  ],
};

export function ConsentPopup({ consentId, onClose }: Props) {
  const blocks = consentId ? BLOCKS[consentId] : [];

  return (
    <Modal
      visible={consentId !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-page" edges={["top", "bottom"]}>
        <View className="flex-row items-center justify-between border-b border-line bg-white px-5 py-4">
          <Text className="flex-1 pr-2 text-lg font-extrabold text-ink-strong">
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

        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-10 pt-6">
          {blocks.map((block) => (
            <View key={block.heading} className="mb-6">
              <Text className="mb-2 text-[17px] font-extrabold text-brand">{block.heading}</Text>
              {block.lines.map((line) => (
                <Text key={line} className="mb-1 text-base leading-[27px] text-ink-body">
                  · {line}
                </Text>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
