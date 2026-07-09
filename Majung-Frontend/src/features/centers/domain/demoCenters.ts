// 오프라인·연결 실패 시 폴백용 데모 센터 (demo-scenario: "지도 데모 데이터 하드코딩 허용").
// 백엔드 centers.json을 미러링 — 정본은 백엔드. 법무보호공단(서울)은 koreha.or.kr 공식 검증값.
import type { Center } from "@/shared/types";

export const DEMO_CENTERS: Center[] = [
  {
    id: "koreha-seoul",
    category: "법무보호공단",
    name: "한국법무보호복지공단 서울지부",
    address: "서울특별시 양천구 지양로 137",
    phone: "02-2605-3427",
    hours: "평일 09:00 - 18:00",
    tags: ["양천구", "생활관·숙식", "출소자 지원"],
    lat: 37.5240231,
    lng: 126.8286777,
  },
  {
    id: "koreha-seoul-east",
    category: "법무보호공단",
    name: "한국법무보호복지공단 서울동부지부",
    address: "서울특별시 송파구 오금로 509",
    phone: "02-3401-7046",
    hours: "평일 09:00 - 18:00",
    tags: ["송파구", "생활관·숙식", "취업 지원"],
    lat: 37.4932058,
    lng: 127.1454615,
  },
  {
    id: "koreha-seoul-east-training",
    category: "법무보호공단",
    name: "한국법무보호복지공단 서울동부기술교육원",
    address: "서울특별시 송파구 오금로 509",
    phone: "02-6952-5181",
    hours: "평일 09:00 - 18:00",
    tags: ["송파구", "직업훈련", "취업 지원"],
    lat: 37.4940058,
    lng: 127.1460615,
  },
  {
    id: "koreha-seoul-west",
    category: "법무보호공단",
    name: "한국법무보호복지공단 서울서부지소",
    address: "서울특별시 은평구 갈현로7길 5-14",
    phone: "02-385-3091",
    hours: "평일 09:00 - 18:00",
    tags: ["은평구", "보호상담", "출소자 지원"],
    lat: 37.6034521,
    lng: 126.9097219,
  },
  {
    id: "koreha-seoul-north",
    category: "법무보호공단",
    name: "한국법무보호복지공단 서울북부지소",
    address: "서울특별시 도봉구 방학로8길 33",
    phone: "02-954-0657",
    hours: "평일 09:00 - 18:00",
    tags: ["도봉구", "보호상담", "출소자 지원"],
    lat: 37.663828,
    lng: 127.0366556,
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
  {
    id: "mental-health-seodaemun",
    category: "주민센터",
    name: "서대문구 정신건강복지센터(예시)",
    address: "서울 서대문구 (상세 주소 검수 필요)",
    phone: "1577-0199",
    hours: "평일 09:00 - 18:00 / 야간 상담 전화 24시간",
    tags: ["서대문구", "마음 상담"],
    lat: 37.582,
    lng: 126.939,
  },
];

/** 카테고리로 폴백 데이터 필터. null/전체면 전부. */
export function filterDemoCenters(category: string | null): Center[] {
  if (!category) return DEMO_CENTERS;
  return DEMO_CENTERS.filter((c) => c.category === category);
}
