// 답변에 붙는 제도 안내 (§4.1·§6.4).
//
// **말풍선을 따로 세우지 않는다.** 예전에는 카드마다 별도 말풍선을 만들고
// `요약 / 어디서: … / 다음 단계`를 이어붙였는데, 값이 KB에서 그대로 온 고정 서식이라
// 대화 가운데에 안내문이 끼어든 것처럼 읽혔다. 사용자가 "목업을 띄우는 것 아니냐"고
// 물은 자리가 바로 이것이다.
//
// **접는 것과 접지 않는 것을 가른다.**
//
//   접지 않는다   창구 안내와 연락처. §6.4 ③단계가 "연락처는 단계와 무관하게 항상
//                 붙는다"이고, 갈 곳이 하나로 정해지는 항목은 전화번호보다 창구 안내가
//                 먼저 온다고 정했다. 접으면 그 계약이 깨진다
//   접는다        준비물·상세·기한·확인 날짜. 지금 당장 읽지 않아도 되는 것들이다
//
// **닫힌 줄에 제도 이름을 적는다.** "더 보기"만 있으면 열 이유를 알 수 없다.
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Icon } from "@/shared/components/Icon";
import { COLORS } from "@/shared/theme/colors";
import type { CardData, CardOption } from "@/shared/types";
import { josa } from "@/shared/utils/korean";

/** 경로가 하나뿐이면 기관명을 앞에 붙이지 않는다 — 붙이면 같은 말이 두 번 나온다. */
function OptionBlock({ option, showOrg }: { option: CardOption; showOrg: boolean }) {
  return (
    <View className="gap-1">
      {showOrg ? (
        <Text className="text-[13px] font-extrabold" style={{ color: COLORS.brand }}>
          {option.org}
        </Text>
      ) : null}

      {/* 창구 안내가 전화번호보다 먼저 온다 (§6.4). 전화를 걸면 무엇을 물어야 할지
          또 판단해야 하지만, 창구에서는 한 문장만 말하면 된다 */}
      {option.desk_place && option.desk_say ? (
        <Text className="text-[14px] leading-[22px] text-ink">
          {option.desk_place}에 가서 “{option.desk_say}”라고 말하면 돼요.
        </Text>
      ) : option.where ? (
        <Text className="text-[14px] leading-[22px] text-ink">{option.where}</Text>
      ) : null}

      {/* **기관명 없이 번호만 내지 않는다** — 어디에 거는지 알 수 없다 */}
      {option.contact_org && option.contact_phone ? (
        <Text className="text-[14px] leading-[22px] text-ink-sub">
          {option.contact_org} {option.contact_phone}
          {josa(option.contact_phone, "으로", "로")} 물어봐도 돼요.
          {option.contact_hours ? ` 전화받는 시간은 ${option.contact_hours}예요.` : ""}
        </Text>
      ) : null}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-2">
      <Text className="w-[64px] text-[13px] font-bold text-ink-sub">{label}</Text>
      <Text className="flex-1 text-[13px] leading-[21px] text-ink">{value}</Text>
    </View>
  );
}

export function CardDetails({ card }: { card: CardData }) {
  const [open, setOpen] = useState(false);

  // 서버가 경로를 안 보내던 때의 응답도 있다. 그때는 카드의 대표 값으로 하나를 세운다.
  const options: CardOption[] =
    card.options && card.options.length > 0
      ? card.options
      : [
          {
            org: card.name,
            where: card.where,
            next_step: card.next_step,
            docs: card.docs,
            desk_place: "",
            desk_say: "",
            contact_org: "",
            contact_phone: "",
            contact_hours: "",
          },
        ];

  const docs = card.docs.length > 0 ? card.docs.join(", ") : "";
  // **값이 있을 때만 접는 자리를 만든다.** 자리를 먼저 잡아두면 대부분의 카드에
  // 빈 공간이 생긴다 (§4.1).
  const hasMore =
    Boolean(docs) ||
    Boolean(card.deadline) ||
    Boolean(card.next_step) ||
    (card.cautions?.length ?? 0) > 0 ||
    (card.steps?.length ?? 0) > 0 ||
    Boolean(card.verified_note);

  return (
    <View
      className="mt-3 rounded-lg border px-3 py-3"
      style={{ backgroundColor: COLORS.card, borderColor: COLORS.lineStrong }}
    >
      <Text className="mb-2 text-[13px] font-extrabold" style={{ color: COLORS.inkSub }}>
        {card.route_label}
      </Text>

      <View className="gap-3">
        {options.map((o, i) => (
          <OptionBlock key={`${o.org}-${i}`} option={o} showOrg={options.length > 1} />
        ))}
      </View>

      {hasMore ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((v) => !v)}
            className="mt-3 flex-row items-center gap-1.5 self-start"
          >
            <Text className="text-[13.5px] font-bold" style={{ color: COLORS.brand }}>
              {card.name} 자세히 보기
            </Text>
            {/* 열리면 꺾쇠를 뒤집는다. 방향이 지금 상태를 말해 준다 */}
            <View style={{ transform: [{ rotate: open ? "180deg" : "0deg" }] }}>
              <Icon name="down" size={16} color={COLORS.brand} />
            </View>
          </Pressable>

          {open ? (
            <View className="mt-2 gap-1.5 border-t border-line-strong pt-2.5">
              {docs ? <Row label="준비물" value={docs} /> : null}
              {card.deadline ? <Row label="기한" value={card.deadline} /> : null}
              {card.next_step ? <Row label="다음" value={card.next_step} /> : null}
              {card.steps?.map((s, i) => (
                <Text key={`step-${i}`} className="text-[13px] leading-[21px] text-ink">
                  {i + 1}. {s}
                </Text>
              ))}
              {card.cautions?.length ? (
                <View className="mt-1 gap-1">
                  <Text className="text-[13px] font-bold text-ink-sub">먼저 확인할 것</Text>
                  {card.cautions.map((c, i) => (
                    <Text key={`caution-${i}`} className="text-[13px] leading-[21px] text-ink">
                      {c}
                    </Text>
                  ))}
                </View>
              ) : null}
              {/* 확인 날짜는 서버가 완성 문장으로 준다. 화면이 날짜만 받아 문장을 만들면
                  "누가 확인한 날짜인지"가 흐려진다 (§6.4) */}
              {card.verified_note ? (
                <Text className="mt-1 text-caption text-ink-hint">{card.verified_note}</Text>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}
