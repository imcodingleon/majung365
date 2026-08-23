// 프레임 안에 뜨는 팝업.
//
// **웹에서 Modal은 AppFrame 바깥에 그려진다.** 루트에만 프레임을 씌우면 화면은
// 모바일 폭인데 팝업만 데스크톱 전체 폭으로 퍼진다. 그래서 팝업 안쪽에도 같은
// 프레임을 씌운다.
//
// `Modal`을 직접 쓰지 않고 이것을 쓴다 — 팝업이 여덟 곳이라 하나씩 손대면 빠뜨린다.
import { Modal, type ModalProps } from "react-native";

import { AppFrame } from "./AppFrame";

export function FramedModal({ children, ...rest }: ModalProps) {
  return (
    <Modal {...rest}>
      {/* 덮개가 반투명한 팝업은 바깥도 비워 둔다. 뒤 화면이 보여야 한다 */}
      <AppFrame transparent={rest.transparent}>{children}</AppFrame>
    </Modal>
  );
}
