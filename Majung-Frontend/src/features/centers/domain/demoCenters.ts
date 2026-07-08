// 오프라인·연결 실패 시 폴백용 데모 센터 (demo-scenario: "지도 데모 데이터 하드코딩 허용").
// 백엔드 centers.json 초안을 미러링 — 실값 검수는 백엔드가 정본. 7/8 인터뷰 후 교체.
import type { Center } from "@/shared/types";

export const DEMO_CENTERS: Center[] = [
  {
    id: "koreha-seoul-west",
    category: "법무보호공단",
    name: "한국법무보호복지공단 서울서부지부",
    address: "서울 영등포구 (상세 주소 검수 필요)",
    phone: "02-000-0000",
    hours: "평일 09:00 - 18:00",
    tags: ["영등포구", "생활관 문의"],
    lat: 37.5264,
    lng: 126.8963,
  },
  {
    id: "koreha-seoul-east",
    category: "법무보호공단",
    name: "한국법무보호복지공단 서울동부지부",
    address: "서울 송파구 (상세 주소 검수 필요)",
    phone: "02-000-0001",
    hours: "평일 09:00 - 18:00",
    tags: ["송파구", "주차가능"],
    lat: 37.5145,
    lng: 127.106,
  },
  {
    id: "resident-center-seodaemun",
    category: "주민센터",
    name: "서대문구 행정복지센터(예시)",
    address: "서울 서대문구 (상세 주소 검수 필요)",
    phone: "02-000-0002",
    hours: "평일 09:00 - 18:00",
    tags: ["서대문구", "주민등록·복지 신청"],
    lat: 37.5791,
    lng: 126.9368,
  },
  {
    id: "employment-center-seoul-west",
    category: "고용센터",
    name: "서울서부고용센터(예시)",
    address: "서울 마포구 (상세 주소 검수 필요)",
    phone: "02-000-0003",
    hours: "평일 09:00 - 18:00",
    tags: ["마포구", "국민취업지원제도"],
    lat: 37.5551,
    lng: 126.9368,
  },
];

/** 카테고리로 폴백 데이터 필터. null/전체면 전부. */
export function filterDemoCenters(category: string | null): Center[] {
  if (!category) return DEMO_CENTERS;
  return DEMO_CENTERS.filter((c) => c.category === category);
}
