// AI 채팅 팝업 (§6.1).
// v1은 탭 안에서 대화하는 구조였는데 정보 카드와 채팅이 좁은 영역에 겹쳐 화면이 혼잡했다.
// 화면 전체를 덮되 페이지 이동은 아니다. 닫으면 보고 있던 탭이 열린 그 상태로 돌아온다.
//
// 이 컴포넌트는 대화 데이터를 만들지 않는다. 스트리밍 연결은 상위에서 주입한다.
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NoteBox, NoteLine } from "@/shared/components/NoteBox";
import { COLORS } from "@/shared/theme/colors";
import { FONTS } from "@/shared/theme/fonts";
import { josa } from "@/shared/utils/korean";
import { clockLabel } from "@/shared/utils/time";

import type { ChatMessage } from "../domain/chatMessage";

import { CardDetails } from "./CardDetails";
import { EvidenceBadge } from "./EvidenceBadge";
import { RichText } from "./RichText";
import { FramedModal } from "@/shared/components/FramedModal";
import { Icon } from "@/shared/components/Icon";

type Props = {
  visible: boolean;
  /** 어느 할 일에 대한 대화인지. 할 일마다 대화방이 따로 있다. */
  taskTitle: string;
  messages: readonly ChatMessage[];
  /** 답변을 기다리는 중이면 입력을 잠근다. */
  busy?: boolean;
  /**
   * 오늘 더 보낼 수 없는 상태 (§6.2). 막지 않고 사람에게 닿는 길로 넘긴다.
   * 한 할 일에 스무 번을 물었다면 채팅으로 풀 문제가 아닐 가능성이 높다.
   */
  limitReached?: boolean;
  /**
   * 입력칸 위에 낼 칩 문장들 (§6.1).
   *
   * **무엇을 낼지는 이 화면이 정하지 않는다.** 대화 전이면 그 할 일의 첫 질문,
   * 오간 뒤면 AI가 제안한 다음 질문인데, 그 갈림은 `domain/chips.ts`가 정하고
   * 라우트가 조립해 내려준다. **비어 있으면 칩 자리를 아예 만들지 않는다** —
   * 빈 띠가 남으면 입력칸이 그만큼 밀려 내려간다.
   */
  chips?: readonly string[];
  onSend: (text: string) => void;
  onClose: () => void;
  onClear: () => void;
  /** 상한에 닿았을 때 여는 도움 연결 화면 (§5.3). */
  onOpenHelp: () => void;
};

/**
 * 말풍선의 그림자 (2026-08-31 시안).
 *
 * **바탕(`#f9fbff`)과 흰 말풍선의 대비가 약해서** 그림자가 없으면 말풍선의 경계가
 * 보이지 않는다. 테두리를 두르는 대신 살짝 띄운다 — 테두리는 상자처럼 읽히고
 * 말풍선은 떠 있는 것으로 읽혀야 한다.
 */
const BUBBLE_SHADOW = {
  shadowColor: "#a6a6a6",
  shadowOffset: { width: 1, height: 4 },
  shadowOpacity: 0.15,
  shadowRadius: 2.5,
  elevation: 2,
} as const;

/**
 * 입력 바가 대화 위로 떠 있게 하는 그림자 (2026-08-31 시안).
 *
 * 선 하나로 가르던 것을 바꿨다. 대화가 길어져 위로 흘러갈 때, 선은 끊긴 자리로 보이고
 * 그림자는 **글이 그 아래로 지나간다**는 것을 알린다.
 */
const INPUT_BAR_SHADOW = {
  shadowColor: "#989898",
  shadowOffset: { width: 0, height: -4 },
  shadowOpacity: 0.1,
  shadowRadius: 5,
  elevation: 8,
} as const;

/** 말풍선 아래에 붙는 시각. 값이 없으면 줄 자체를 만들지 않는다. */
function BubbleTime({ at, align }: { at?: string; align: "left" | "right" }) {
  const label = clockLabel(at ?? null);
  if (!label) return null;
  return (
    <Text
      className={align === "right" ? "self-end" : "self-start"}
      style={{ fontSize: 14, fontFamily: FONTS.medium, color: COLORS.inkFaint }}
    >
      {label}
    </Text>
  );
}

/**
 * 답을 기다리는 동안 도는 점 세 개 (2026-08-31 시안).
 *
 * **글 대신 움직임으로 알린다.** "답을 찾고 있어요"라는 문장은 답변 말풍선과 같은
 * 모양이라, 저리터러시 사용자에게는 그것도 읽어야 할 답으로 보였다.
 *
 * 한 바퀴가 1초를 넘게 잡혀 있다. 초당 세 번을 넘겨 깜빡이면 광과민성 발작을 부를 수
 * 있어서, 밝아지고 어두워지는 속도를 그만큼 늦췄다.
 */
function TypingDots() {
  const dots = useRef([
    new Animated.Value(0.3),
    new Animated.Value(0.3),
    new Animated.Value(0.3),
  ]).current;

  useEffect(() => {
    const loops = dots.map((value, i) =>
      Animated.loop(
        Animated.sequence([
          // 점마다 시작을 늦춰 왼쪽에서 오른쪽으로 흐르게 한다.
          Animated.delay(i * 160),
          Animated.timing(value, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.3, duration: 380, useNativeDriver: true }),
          // 남은 점들이 끝날 때까지 기다렸다가 다시 시작한다.
          Animated.delay((2 - i) * 160),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [dots]);

  return (
    <View
      className="flex-row items-center gap-1.5"
      accessible
      accessibilityLabel="답을 찾고 있어요"
    >
      {dots.map((value, i) => (
        <Animated.View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: COLORS.brandMuted,
            opacity: value,
          }}
        />
      ))}
    </View>
  );
}

/** 마중365가 말할 때 옆에 서는 얼굴. 누가 말하는지 좌우 정렬만으로는 갈리지 않는다. */
function BotFace() {
  return (
    <View
      className="size-10 items-center justify-center rounded-full"
      style={{ backgroundColor: COLORS.brand }}
    >
      <Icon name="bot" size={20} color={COLORS.surface} />
    </View>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <View className="mb-[35px] items-end gap-[5px]">
        <View
          className="max-w-[82%] rounded-2xl rounded-br-sm px-4 py-3"
          style={{ backgroundColor: COLORS.brand, ...BUBBLE_SHADOW }}
        >
          <Text
            style={{
              fontSize: 16,
              lineHeight: 25,
              fontFamily: FONTS.medium,
              color: COLORS.surface,
            }}
          >
            {message.text}
          </Text>
        </View>
        <BubbleTime at={message.at} align="right" />
      </View>
    );
  }

  if (message.role === "search-notice") {
    // 사전 고지는 답변이 아니다. 말풍선과 다른 모양으로 두어 정보로 읽히지 않게 한다.
    return (
      <NoteBox tone="warn" className="mb-[35px] self-stretch">{message.text}</NoteBox>
    );
  }

  return (
    // 시안의 아바타. **누가 말하는지가 한눈에 보여야 한다** — 저리터러시 사용자에게
    // 좌우 정렬만으로는 사람 말과 기계 말이 구별되지 않는다.
    <View className="mb-[35px] max-w-[92%] flex-row items-start gap-2.5 self-start">
      <BotFace />
      <View className="min-w-0 flex-1 gap-[5px]">
      <View
        className="rounded-[10px] rounded-tl-none px-4 py-2.5"
        style={{ backgroundColor: COLORS.surface, ...BUBBLE_SHADOW }}
      >
      {/* 모델이 쓴 `**굵게**`와 `---`를 푼다. 그대로 두면 별표가 화면에 보인다.
          **본문 없이 카드만 오는 응답이 있다** — 그때 빈 글줄을 그리면 말풍선 위에
          까닭 없는 여백이 남는다 */}
      {message.text ? (
        <RichText text={message.text} className="text-[16px] leading-[24px] text-ink" />
      ) : null}

      {/* 근거가 된 제도 안내. 창구와 연락처는 펼쳐 두고 나머지는 접는다 (§6.4) */}
      {message.cards?.map((card) => (
        <CardDetails key={card.institution_id} card={card} />
      ))}

      {message.desk ? (
        // 값이 섞인 문장은 NoteLine으로 감싼다. 그대로 두면 조각이 View의 자식이 되어
        // 안드로이드에서 터진다 — NoteBox는 자식이 문자열 하나일 때만 감싼다.
        <NoteBox tone="info" className="mt-3">
          <NoteLine tone="info">
            {message.desk.place}에 가서 “{message.desk.say}”라고 말하면 돼요.
          </NoteLine>
        </NoteBox>
      ) : null}

      {/* **확인한 날짜는 화면에 내지 않는다** (2026-08-26 결정). 근거를 밝히는 일은
          이 배지가 맡는다 — 날짜까지 적으면 저리터러시 사용자에게는 읽을 것만 늘고,
          "8월 23일"이 방문해야 할 날짜로 읽히기까지 한다 */}
      {message.evidence ? <EvidenceBadge evidence={message.evidence} /> : null}

      {message.contact ? (
        <View className="mt-2 border-t border-line-strong pt-2">
          <Text className="text-caption text-ink-sub">
            더 정확한 내용은 {message.contact.org} {message.contact.phone}
            {josa(message.contact.phone, "으로", "로")} 물어보시는 게 좋아요.
          </Text>
          {message.contact.hours ? (
            <Text className="text-caption text-ink-sub">
              전화받는 시간은 {message.contact.hours}예요.
            </Text>
          ) : null}
        </View>
      ) : null}
      </View>
      <BubbleTime at={message.at} align="left" />
      </View>
    </View>
  );
}

export function ChatPopup({
  visible,
  taskTitle,
  messages,
  busy,
  limitReached,
  chips = [],
  onSend,
  onClose,
  onClear,
  onOpenHelp,
}: Props) {
  const [draft, setDraft] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // 새 메시지가 오면 맨 아래로 내린다. 안 그러면 답이 온 줄 모른다.
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages.length, visible]);

  // 팝업을 닫으면 열려 있던 메뉴도 함께 접는다.
  useEffect(() => {
    if (!visible) {
      setMenuOpen(false);
      setConfirmClear(false);
    }
  }, [visible]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy || limitReached) return;
    setDraft("");
    onSend(text);
  };

  return (
    <FramedModal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      // 안드로이드 뒤로 가기도 닫기와 같게 둔다. 경고 없이 바로 닫힌다 (§6.3).
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
        {/* 시안대로 닫기를 왼쪽에 둔다. 오른쪽 위는 엄지가 닿기 먼 자리라 나가는 길을
            거기 두면 저리터러시 사용자가 갇힌 느낌을 받는다. */}
        <View className="flex-row items-center gap-2 border-b border-line px-3 py-3">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="대화 닫기"
            className="size-10 items-center justify-center rounded-full active:opacity-70"
          >
            <Icon name="close" size={22} color={COLORS.inkMuted} />
          </Pressable>

          {/* **오른쪽으로 붙인다** (2026-08-31 시안). 왼쪽에 두면 제목 둘이 화면
              양끝으로 갈라져, "공단 긴급지원"과 "AI 챗봇"이 서로 다른 것을 가리키는
              말처럼 읽힌다 */}
          <View className="flex-1 items-end px-1">
            <Text className="text-body font-medium text-ink-muted" numberOfLines={1}>
              {taskTitle}
            </Text>
          </View>

          <Text className="text-title font-bold text-ink-strong">AI 챗봇</Text>
          <Pressable
            onPress={() => setMenuOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel="더보기"
            className="size-10 items-center justify-center rounded-full active:opacity-70"
          >
            <Text className="text-xl text-ink-muted">⋯</Text>
          </Pressable>
        </View>

        {menuOpen ? (
          <View className="absolute right-4 top-[68px] z-10 rounded-xl border border-line bg-white py-1 shadow">
            <Pressable
              onPress={() => {
                setMenuOpen(false);
                setConfirmClear(true);
              }}
              accessibilityRole="button"
              className="px-5 py-3 active:opacity-70"
            >
              <Text className="text-body font-semibold text-alert">이 대화 지우기</Text>
            </Pressable>
          </View>
        ) : null}

        {confirmClear ? (
          <View className="mx-4 mt-3 rounded-xl border border-alert-line bg-alert-soft px-4 py-4">
            <Text className="text-body font-semibold text-alert-ink">
              이 대화를 지우면 다시 볼 수 없어요.
            </Text>
            <View className="mt-3 flex-row gap-2">
              <Pressable
                onPress={() => {
                  setConfirmClear(false);
                  onClear();
                }}
                accessibilityRole="button"
                className="rounded-lg bg-alert px-4 py-3 active:opacity-90"
              >
                <Text className="text-body font-extrabold text-white">지울게요</Text>
              </Pressable>
              <Pressable
                onPress={() => setConfirmClear(false)}
                accessibilityRole="button"
                className="rounded-lg border border-line bg-white px-4 py-3 active:opacity-90"
              >
                <Text className="text-body font-semibold text-ink-sub">그냥 둘게요</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {/* 시안의 바탕색. 흰 말풍선이 바탕과 갈리려면 바탕이 흰색이면 안 된다 */}
          <ScrollView
            ref={scrollRef}
            className="flex-1 bg-page"
            contentContainerClassName="px-[30px] pb-5 pt-[30px]"
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 ? (
              // 이 화면에 이것 말고 아무것도 없다. 작게 두면 빈 화면으로 보인다 (시안 18px).
              <View className="mt-9 px-2">
                <Text
                  className="text-center text-ink-muted"
                  style={{ fontSize: 18, lineHeight: 25, fontFamily: FONTS.medium }}
                >
                  {taskTitle}에 대해 궁금한 것을 물어보세요.{"\n"}
                  편하게 적으셔도 괜찮아요.
                </Text>
              </View>
            ) : null}

            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
            {busy ? (
              // 답변 말풍선과 같은 자리에 같은 모양으로 둔다. 답이 오면 이 자리가
              // 그대로 말풍선으로 바뀌므로 화면이 튀지 않는다.
              <View className="mb-[35px] flex-row items-start gap-2.5 self-start">
                <BotFace />
                <View
                  className="rounded-[10px] rounded-tl-none px-4 py-3"
                  style={{ backgroundColor: COLORS.surface, ...BUBBLE_SHADOW }}
                >
                  <TypingDots />
                </View>
              </View>
            ) : null}
          </ScrollView>

          {limitReached ? (
            // 막지 않는다. 오늘은 여기까지라고 끝내면 가장 답답한 사람을 문 앞에서 돌려보내는 셈이다.
            <View className="border-t border-line bg-note-warn px-4 py-4">
              <Text className="text-body font-semibold text-note-warn-ink">
                오늘 이 일로 이야기를 많이 나누셨어요.{"\n"}
                사람에게 직접 물어보는 편이 더 빠를 수 있어요.
              </Text>
              <Pressable
                onPress={onOpenHelp}
                accessibilityRole="button"
                className="mt-3 items-center rounded-xl bg-brand px-4 py-4 active:opacity-90"
              >
                <Text className="text-body-lg font-extrabold text-white">전화로 물어보기</Text>
              </Pressable>
            </View>
          ) : (
            <View className="bg-white" style={INPUT_BAR_SHADOW}>
              {/* 값이 있을 때만 자리가 생긴다. 대화 전에는 첫 질문, 오간 뒤에는
                  AI가 제안한 다음 질문이고, 제안이 없으면 이 띠가 통째로 없다 */}
              {chips.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="max-h-14"
                  // 입력창과 왼쪽 끝을 맞춘다. 칩만 안쪽에서 시작하면 줄이 어긋나 보인다
                  contentContainerClassName="gap-2 px-6 pb-1 pt-3"
                  keyboardShouldPersistTaps="handled"
                >
                  {chips.map((chip) => (
                    <Pressable
                      key={chip}
                      onPress={() => onSend(chip)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={chip}
                      className="rounded-full px-4 py-3 active:opacity-80"
                      style={{ backgroundColor: COLORS.chip }}
                    >
                      {/* 굵게 두면 답변보다 먼저 눈에 들어온다. 이 칩은 **거들 뿐**이다 */}
                      <Text style={{ fontSize: 14, fontFamily: FONTS.medium, color: COLORS.chipInk }}>
                        {chip}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              {/* **보내기는 입력창 세로 가운데에 선다** (시안). 아래에 맞추면 여러 줄을
                  적을 때 버튼만 바닥에 남아 입력창에서 떨어져 나온 것처럼 보인다 */}
              <View className="flex-row items-center gap-3 px-6 pb-5 pt-2">
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="궁금한 것을 물어보세요."
                  placeholderTextColor={COLORS.inkFaint}
                  multiline
                  // **한 줄에서 시작한다.** `multiline`만 주면 웹에서 `<textarea>`의
                  // 기본 두 줄(`rows=2`)이 잡혀, 한 줄만 적어도 상자가 74px로 부푼다.
                  // 시안은 55px이다. 여러 줄을 적으면 `max-h`까지 알아서 늘어난다.
                  numberOfLines={1}
                  accessibilityLabel="질문 입력"
                  // 알약 모양이다. 네모난 상자보다 "여기에 말을 넣는 자리"로 읽힌다.
                  // **위아래 여백으로 글자를 가운데에 놓는다.** `min-h`만 키우면
                  // 글자가 위에 붙은 채로 상자만 커진다 — 실제로 그렇게 보였다.
                  className="max-h-28 flex-1 rounded-full px-5 py-[18px]"
                  style={{
                    backgroundColor: COLORS.line,
                    fontSize: 16,
                    fontFamily: FONTS.medium,
                    color: COLORS.inkStrong,
                  }}
                />
                {/* 시안의 원형 전송 버튼. 글자 대신 화살표를 쓰면 글을 읽기 어려운
                    사람도 방향으로 뜻을 안다 */}
                <Pressable
                  onPress={send}
                  disabled={!draft.trim() || busy}
                  accessibilityRole="button"
                  accessibilityLabel="보내기"
                  className="size-10 items-center justify-center rounded-full active:opacity-90"
                  style={{
                    backgroundColor: !draft.trim() || busy ? COLORS.brandMuted : COLORS.brand,
                  }}
                >
                  <Icon name="send" size={22} color={COLORS.surface} />
                </Pressable>
              </View>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </FramedModal>
  );
}
