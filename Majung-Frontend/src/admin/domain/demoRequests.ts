// 시연용 방문 요청 표본 (§8.3).
//
// **실데이터가 아니다.** 백엔드에 담당자 API가 없고, 생긴 뒤에도 실제 인증이 붙기 전까지는
// 연결하지 않는다. 실제 인증이 붙을 때 이 파일을 지운다.
//
// §7.4의 전달 항목만 담는다. **죄목과 생일은 여기 없다.**
import type { StaffRequest } from "./staffRequest";

export const DEMO_REQUESTS: readonly StaffRequest[] = [
  {
    id: "req-1",
    name: "김판수",
    purpose: "긴급지원 신청하기",
    firstChoice: "8월 25일 월요일 오전",
    secondChoice: "8월 26일 화요일 오후",
    readyDocs: ["출소증명서"],
    allDocs: ["출소증명서"],
    note: "오전에 다른 일이 있어서 늦을 수도 있어요.",
    releaseDate: "2026-08-03",
    status: "sent",
    receivedAt: "오늘 오전 9시 12분",
  },
  {
    id: "req-2",
    name: "이경호",
    purpose: "지낼 곳 상담하기",
    firstChoice: "8월 25일 월요일 오후",
    secondChoice: "8월 27일 목요일 오전",
    readyDocs: [],
    allDocs: ["출소증명서", "신분증"],
    status: "acknowledged",
    receivedAt: "어제 오후 4시 40분",
  },
  {
    id: "req-3",
    name: "박상우",
    purpose: "주민등록 되살리기",
    firstChoice: "8월 26일 화요일 오전",
    secondChoice: "8월 28일 금요일 오전",
    readyDocs: ["출소증명서"],
    allDocs: ["출소증명서"],
    status: "confirmed",
    receivedAt: "이틀 전",
  },
];
