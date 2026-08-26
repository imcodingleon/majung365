// 웹 실지도 — Google Maps JS API. 마커 클릭 시 이름·전화·운영시간 정보창.
// 키(EXPO_PUBLIC_GOOGLE_MAPS_KEY)는 클라이언트 노출 전제 → 리퍼러 제한이 방어막.
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";

import type { Center } from "@/shared/types";

import { MapFallbackPanel } from "./MapFallbackPanel";

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;

// 사용하는 google.maps 부분만 최소 타입 선언 (any 회피, @types 의존성 없이).
interface GLatLng {
  lat: number;
  lng: number;
}
interface GMap {
  setCenter(p: GLatLng): void;
  setZoom(z: number): void;
  fitBounds(b: GLatLngBounds, padding?: number): void;
}
interface GMarker {
  addListener(event: string, cb: () => void): void;
}
interface GInfoWindow {
  setContent(html: string): void;
  open(map: GMap, anchor: GMarker): void;
}
/** 여러 지점을 감싸는 사각 범위. 지도를 여기에 맞추면 전부 화면에 들어온다. */
interface GLatLngBounds {
  extend(p: GLatLng): void;
}
interface GMaps {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  Marker: new (opts: Record<string, unknown>) => GMarker;
  InfoWindow: new () => GInfoWindow;
  LatLngBounds: new () => GLatLngBounds;
}
declare global {
  interface Window {
    google?: { maps: GMaps };
    /**
     * 구글이 키 인증에 실패하면 부르는 전역 함수. **이름을 바꿀 수 없다.**
     *
     * 스크립트 로드 자체는 성공하므로 `catch`로는 잡히지 않는다. 이것을 두지 않으면
     * 구글이 지도 자리에 자기 오류 패널을 그린다.
     */
    gm_authFailure?: () => void;
  }
}

let loader: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.maps) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${KEY ?? ""}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Google Maps 로드 실패"));
    document.head.appendChild(s);
  });
  return loader;
}

export function CenterMap({ centers }: { centers: Center[] }) {
  const ref = useRef<View>(null);
  /**
   * 지도를 띄우지 못했는지.
   *
   * **인증 실패는 예외로 오지 않는다.** 스크립트는 정상으로 내려오고, 키가 막혔다는
   * 사실은 구글이 `gm_authFailure`를 부르면서 알린다. 이것을 잡지 않으면 구글이 그
   * 자리에 자기 오류 패널("죄송합니다. 문제가 발생했습니다")을 그려 버린다.
   */
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!KEY) return;
    // 구글이 부르는 전역 함수다. 이름을 바꿀 수 없다.
    window.gm_authFailure = () => setFailed(true);
    return () => {
      window.gm_authFailure = undefined;
    };
  }, []);

  useEffect(() => {
    if (!KEY) return;
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled) return;
        const node = ref.current as unknown as HTMLElement | null;
        const maps = window.google?.maps;
        if (!node || !maps) return;
        const first = centers[0];
        const map = new maps.Map(node, {
          center: first ? { lat: first.lat, lng: first.lng } : { lat: 37.55, lng: 126.93 },
          zoom: 12,
          disableDefaultUI: true,
          clickableIcons: false,
        });
        const info = new maps.InfoWindow();
        const bounds = new maps.LatLngBounds();
        for (const c of centers) {
          const at = { lat: c.lat, lng: c.lng };
          const marker = new maps.Marker({ position: at, map, title: c.name });
          bounds.extend(at);
          marker.addListener("click", () => {
            info.setContent(
              `<div style="font-size:13px;line-height:1.5"><b>${c.name}</b><br/>${c.phone}<br/>${c.hours}</div>`,
            );
            info.open(map, marker);
          });
        }

        // **찍은 것이 전부 화면에 들어오게 한다.** 첫 기관을 중심에 놓고 확대를 고정하면
        // 나머지가 화면 밖으로 밀려, 목록에는 여덟 곳이 있는데 지도에는 하나만 보인다.
        if (centers.length > 1) {
          map.fitBounds(bounds, 40);
        } else if (centers.length === 1) {
          // 한 곳뿐이면 범위가 점 하나라 최대까지 당겨진다. 동네가 보이는 정도로 둔다.
          map.setZoom(15);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [centers]);

  if (!KEY || failed) return <MapFallbackPanel />;
  return (
    <View
      ref={ref}
      className="h-56 overflow-hidden rounded-2xl border border-line bg-line"
    />
  );
}
