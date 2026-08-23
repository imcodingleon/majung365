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

export function NearbyPlaces({ offices, institutions, place, anyBranch }: Props) {
  if (!place) return null;

  const picked = offices.length > 0 ? pickOffices(offices, place.dong) : null;
  // 공단 기관은 지역이 안 맞아도 목록에 남는다. 그 지역 것을 앞에 두고 둘까지만 낸다.
  const centers = institutions.filter((x) => x.district.startsWith(place.district.slice(0, 3)));
  const shown = (centers.length > 0 ? centers : institutions).slice(0, 2);

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
