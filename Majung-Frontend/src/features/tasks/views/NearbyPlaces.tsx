// 할 일 카드 안의 근처 기관 (§5.4).
//
// "가까운 주민센터에 가세요"라고만 하면 사용자는 그 순간 다시 찾아야 한다.
// **이름과 주소를 짚어주는 것이 이 구역의 일이다.**
//
// 값이 없으면 아무것도 그리지 않는다. 위치를 모르거나 그 항목에 해당이 없으면
// 자리를 비워 두는 것이 맞다 — 빈 상자는 "여기 뭔가 있어야 하는데"로 읽힌다.
import { Text, View } from "react-native";

import type { LocatedPlace } from "@/shared/location";
import { COLORS } from "@/shared/theme/colors";
import type { DistrictOffice, Institution } from "@/shared/types";

type Props = {
  offices: readonly DistrictOffice[];
  institutions: readonly Institution[];
  place: LocatedPlace | null;
  /** 신분증 재발급처럼 어느 곳에서나 되는 일인지. 그러면 "아무 곳이나" 안내를 붙인다. */
  anyBranch?: boolean;
};

function Row({ name, address, badge }: { name: string; address: string; badge?: string }) {
  return (
    <View className="mt-2 first:mt-0">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-body font-extrabold text-ink-strong">{name}</Text>
        {badge ? (
          <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: COLORS.brandSoft }}>
            <Text className="text-caption font-extrabold" style={{ color: COLORS.brand }}>
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-0.5 text-caption text-ink-sub">{address}</Text>
    </View>
  );
}

/**
 * 그 사람이 사는 동의 주민센터를 앞에 둔다.
 *
 * **동 이름이 정확히 맞지 않을 수 있다.** 경계 데이터가 "불당동"인데 주민센터는
 * "불당1동"·"불당2동"으로 갈려 있는 식이라, 앞부분이 겹치면 같은 동네로 본다.
 */
function pickOffices(
  offices: readonly DistrictOffice[],
  dong: string,
): { list: readonly DistrictOffice[]; mineFirst: boolean } {
  if (!dong) return { list: offices.slice(0, 2), mineFirst: false };
  const stem = dong.replace(/\d+(동|가)$/, "").replace(/동$/, "");
  const mine = offices.filter((o) => o.dong === dong || (stem.length >= 2 && o.dong.startsWith(stem)));
  if (mine.length === 0) return { list: offices.slice(0, 2), mineFirst: false };
  const rest = offices.filter((o) => !mine.includes(o));
  return { list: [...mine, ...rest].slice(0, 2), mineFirst: true };
}

/**
 * 이 지역에서 안내할 기관 둘까지.
 *
 * **갈래마다 지역 단위가 다르다.**
 *
 * - 공단 지부·교육원·허그상담소는 **광역 단위**다. `district`가 아예 비어 있고
 *   `sido`가 짧은 이름("서울")으로 온다. 시군구로 거르면 전부 사라지고,
 *   안 거르면 **송파구 사람에게 도봉구 지부가 나온다.**
 * - 정신건강복지센터는 시군구 단위라 그 구의 것만 맞다.
 *
 * 서버가 가까운 것을 앞에 두고 보내므로, 갈래마다 맞는 것을 걸러 앞에서부터 쓴다.
 */
function pickInstitutions(
  institutions: readonly Institution[],
  place: LocatedPlace,
): readonly Institution[] {
  // "서울특별시" → "서울". 공단 데이터가 짧은 이름을 쓴다.
  const shortSido = place.sido.replace(/(특별자치시|특별자치도|특별시|광역시|도)$/, "");
  const isCenter = (x: Institution) => x.kind === "mental_health";
  const fit = institutions.filter((x) =>
    isCenter(x)
      ? x.district.startsWith(place.district) || place.district.startsWith(x.district)
      : x.sido === shortSido || x.sido === place.sido,
  );
  // **그 지역에 없으면 아무것도 안 낸다.** 허그상담소는 전국 세 곳뿐이라 서울에는
  // 없는데, 폴백으로 하나를 내면 서울 사람에게 원주로 가라고 하는 셈이 된다.
  // 카드에는 대표번호가 이미 있어 전화로 물을 수 있다.
  const list = fit;

  // **공단은 한 곳만 낸다.** 한 광역에 지부가 여럿인데(서울만 넷) 어느 구가 어느 지부
  // 관할인지는 서버도 모른다. 둘을 늘어놓으면 사용자가 고르게 되고, 그것은 "어디로 가면
  // 되는지 짚어주는" 것이 아니다(§5.4). 정확한 지부는 카드에 이미 있는 대표번호로
  // 확인할 수 있다.
  return list[0] && !isCenter(list[0]) ? list.slice(0, 1) : list.slice(0, 2);
}

export function NearbyPlaces({ offices, institutions, place, anyBranch }: Props) {
  if (!place) return null;

  const picked = offices.length > 0 ? pickOffices(offices, place.dong) : null;
  const shown = pickInstitutions(institutions, place);

  if (!picked && shown.length === 0) return null;

  return (
    <View
      className="mb-4 rounded-xl border-[1.5px] px-4 py-3"
      style={{ borderColor: COLORS.brandSoft, backgroundColor: COLORS.surface }}
    >
      <Text className="mb-2 text-caption font-extrabold" style={{ color: COLORS.brand }}>
        가까운 곳
      </Text>

      {picked
        ? picked.list.map((o, i) => (
            <Row
              key={`${o.dong}-${o.name}`}
              name={o.name}
              address={o.address}
              badge={i === 0 && picked.mineFirst ? "여기예요" : undefined}
            />
          ))
        : shown.map((x) => <Row key={x.name} name={x.name} address={x.address} />)}

      {/* §5.4가 정한 것이다 — R9는 "아무 곳이나"가 부정확한 차선이 아니라 정확한 답이다.
          이 말이 없으면 자기 동 주민센터를 찾아 멀리 가는 사람이 생긴다 */}
      {anyBranch ? (
        <Text className="mt-3 text-caption text-ink-sub">
          어느 주민센터에서나 하실 수 있어요. 가까운 곳으로 가세요.
        </Text>
      ) : null}
    </View>
  );
}
