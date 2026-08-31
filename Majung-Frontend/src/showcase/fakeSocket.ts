// 시연용 가짜 socket.io 서버.
//
// **왜 이것이 필요한가.** 담당자와 나누는 대화(`UserChatSheet`·`StaffChatScreen`)는
// HTTP가 아니라 socket.io로 오간다. `useVisitChat`이 `io(API_BASE)`를 직접 부르므로
// `fetch`를 갈아 끼우는 것으로는 닿지 않고, 소켓을 그냥 막으면 대화 화면이 **빈 방**으로
// 뜬다 — 시연에서 가장 보여주고 싶은 화면이 아무것도 없는 채로 찍힌다.
//
// 그래서 **전송 계층을 흉내 낸다.** engine.io-client는 브라우저에서 XHR 롱폴링으로
// 붙으므로(`transports/index.js`의 기본값이 `polling: XHR`), `XMLHttpRequest`를 갈아
// 끼우면 서버 없이도 손을 맞출 수 있다.
//
// 흉내 내는 범위는 딱 이만큼이다.
//   ① 핸드셰이크        GET  ?EIO=4&transport=polling            → `0{...}`
//   ② 네임스페이스 접속  POST `40`                                 → `40{"sid":…}`
//   ③ 입장             POST `42<ack>["join",{visitId}]`          → `43<ack>[{ok,messages}]`
//   ④ 보내기           POST `42["send_message",{body,clientMsgId}]` → `42["new_message",…]`
//   ⑤ 읽음             POST `42["mark_read",{}]`                  → 아무것도 하지 않음
//
// **실서버로는 한 바이트도 나가지 않는다.** 백엔드 주소로 가는 XHR은 전부 여기서 끝나고,
// 그 밖의 주소는 진짜 `XMLHttpRequest`에 그대로 넘긴다.

/** 서버가 주는 메시지 한 건. `useVisitChat`의 `ServerMessage`와 같은 모양이다. */
export type SocketMessage = {
  id: string;
  visitId: string;
  body: string;
  senderRole: "staff" | "user";
  createdAt: string;
  clientMsgId?: string;
};

/** 폴링 응답에서 패킷을 잇는 구분자 (Engine.IO v4). */
const RS = "\u001e";

/** 롱폴링을 붙들고 있는 한도. 이보다 오래 조용하면 핑을 하나 보내 연결을 살려 둔다. */
const POLL_HOLD_MS = 20_000;

/** 한 문서 안의 연결 상태. 프레임마다 하나면 충분하다. */
type Room = {
  /** 아직 클라이언트에게 못 보낸 패킷들. */
  outbox: string[];
  /** 기다리는 중인 폴링. 패킷이 생기면 이 함수를 부른다. */
  waiting: (() => void) | null;
  /** 지금 들어와 있는 방. `join`으로 정해진다. */
  visitId: string | null;
};

const room: Room = { outbox: [], waiting: null, visitId: null };

function push(packet: string): void {
  room.outbox.push(packet);
  const wake = room.waiting;
  room.waiting = null;
  wake?.();
}

/** 쌓인 패킷을 꺼내 폴링 응답 본문으로 만든다. */
function drain(): string {
  const packets = room.outbox.splice(0, room.outbox.length);
  return packets.join(RS);
}

/**
 * 클라이언트가 보낸 패킷 하나를 처리한다.
 *
 * **모르는 이벤트는 조용히 넘긴다.** 시연 화면이 쓰지 않는 이벤트가 하나 늘었다고
 * 대화가 멈추면 안 된다.
 */
function handle(packet: string, messagesFor: (visitId: string) => SocketMessage[]): void {
  // `40` — 네임스페이스 접속. 이것에 답해야 `connect`가 뜨고 화면이 살아난다.
  if (packet === "40" || packet.startsWith("40")) {
    push('40{"sid":"showcase-nsp"}');
    return;
  }

  // `42…` — 이벤트. 앞에 붙은 숫자가 있으면 응답(ack)을 기다린다는 뜻이다.
  const event = /^42(\d*)(\[.*\])$/.exec(packet);
  if (!event) return;

  const ack = event[1];
  let payload: unknown;
  try {
    payload = JSON.parse(event[2]);
  } catch {
    return;
  }
  if (!Array.isArray(payload)) return;

  const [name, arg] = payload as [string, Record<string, unknown> | undefined];

  if (name === "join") {
    const visitId = typeof arg?.visitId === "string" ? arg.visitId : "";
    room.visitId = visitId;
    const messages = messagesFor(visitId);
    // ack이 없으면 화면이 지난 대화를 영영 못 받는다. 번호를 그대로 돌려준다.
    if (ack !== "") {
      push(`43${ack}${JSON.stringify([{ ok: true, messages }])}`);
    }
    return;
  }

  if (name === "send_message") {
    const body = typeof arg?.body === "string" ? arg.body : "";
    const clientMsgId = typeof arg?.clientMsgId === "string" ? arg.clientMsgId : undefined;
    if (!body) return;
    // **에코를 돌려준다.** 화면은 낙관적으로 그린 말풍선을 이 에코로 바꿔 단다.
    // 돌려주지 않으면 보낸 말이 영영 "보내는 중"으로 남는다.
    const echo: SocketMessage = {
      id: `m-echo-${Date.now()}`,
      visitId: room.visitId ?? "",
      body,
      senderRole: "user",
      createdAt: new Date().toISOString(),
      ...(clientMsgId ? { clientMsgId } : {}),
    };
    push(`42${JSON.stringify(["new_message", echo])}`);
    return;
  }

  // `mark_read`를 비롯한 나머지는 서버가 답할 것이 없다.
}

/** 이 요청이 socket.io 손짓인가. */
function isSocketIo(url: string): boolean {
  return url.includes("/socket.io/");
}

/**
 * `XMLHttpRequest`를 갈아 끼운다.
 *
 * **진짜를 상속한다.** 백엔드가 아닌 요청은 손대지 않고 그대로 원본에게 맡긴다 —
 * 구글 지도 타일이 이 길로 오는데, 처음에는 진짜를 흉내 낸 물건으로 대신 받다가
 * `addEventListener`·`response`·`getAllResponseHeaders` 같은 것이 없어서 **지도가
 * 군데군데 비어 떴다.** 흉내 내는 범위는 백엔드로 가는 요청 하나로 좁힌다.
 *
 * 백엔드로 가는 요청에서는 `open`·`send`를 가로채고, engine.io가 읽는 세 값
 * (`readyState`·`status`·`responseText`)만 인스턴스에 직접 얹어 프로토타입의
 * 접근자를 가린다.
 */
export function installFakeSocketIo(
  isBackend: (url: string) => boolean,
  messagesFor: (visitId: string) => SocketMessage[],
): void {
  const RealXhr = window.XMLHttpRequest;

  class ShowcaseXhr extends RealXhr {
    private faked = false;
    private fakeMethod = "GET";
    private fakeUrl = "";
    private fakeAborted = false;

    open(method: string, url: string | URL, ...rest: unknown[]): void {
      this.fakeMethod = String(method).toUpperCase();
      this.fakeUrl = String(url);
      this.faked = isBackend(this.fakeUrl);
      if (this.faked) return;
      // @ts-expect-error 원본 시그니처를 그대로 넘긴다.
      super.open(method, url, ...rest);
    }

    setRequestHeader(name: string, value: string): void {
      if (this.faked) return;
      super.setRequestHeader(name, value);
    }

    abort(): void {
      if (this.faked) {
        this.fakeAborted = true;
        room.waiting = null;
        return;
      }
      super.abort();
    }

    send(data?: Document | XMLHttpRequestBodyInit | null): void {
      if (!this.faked) {
        super.send(data ?? null);
        return;
      }

      // 백엔드로 가는 XHR이다. **네트워크로 내보내지 않는다.**
      if (!isSocketIo(this.fakeUrl)) {
        this.finish(200, "{}");
        return;
      }

      const hasSid = /[?&]sid=/.test(this.fakeUrl);

      if (this.fakeMethod === "POST") {
        for (const packet of String(data ?? "").split(RS)) {
          if (packet) handle(packet, messagesFor);
        }
        this.finish(200, "ok");
        return;
      }

      if (!hasSid) {
        // 첫 손짓. 업그레이드 후보를 비워 두어 웹소켓으로 올라가려 하지 않게 한다.
        this.finish(
          200,
          '0{"sid":"showcase-sid","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}',
        );
        return;
      }

      // 롱폴링. 보낼 것이 있으면 바로, 없으면 생길 때까지 붙들고 있는다.
      if (room.outbox.length > 0) {
        this.finish(200, drain());
        return;
      }
      const timer = setTimeout(() => {
        if (this.fakeAborted) return;
        room.waiting = null;
        // 핑 하나로 연결을 살려 둔다. 빈 응답을 주면 클라이언트가 곧바로 다시 물어 온다.
        this.finish(200, "2");
      }, POLL_HOLD_MS);
      room.waiting = () => {
        clearTimeout(timer);
        if (!this.fakeAborted) this.finish(200, drain());
      };
    }

    /**
     * 응답 한 번을 완결한다. engine.io는 `readyState === 4`만 본다.
     *
     * **반드시 다음 틱에 답한다.** `send()` 안에서 곧바로 답하면 engine.io가 아직
     * 자기 준비를 마치기 전에 다시 불려 들어온다 — 손짓 응답 하나를 받고는 그다음
     * 폴링을 아예 시작하지 않았다. 진짜 XHR도 동기로 답하지 않는다.
     */
    private finish(status: number, body: string): void {
      setTimeout(() => {
        if (this.fakeAborted) return;
        // 프로토타입의 접근자를 인스턴스 값으로 가린다. 진짜 XHR은 열지 않았으므로
        // 원본 값은 계속 0과 빈 문자열이다.
        Object.defineProperty(this, "status", { value: status, configurable: true });
        Object.defineProperty(this, "responseText", { value: body, configurable: true });
        Object.defineProperty(this, "readyState", { value: 4, configurable: true });
        this.onreadystatechange?.(new Event("readystatechange"));
      }, 0);
    }
  }

  window.XMLHttpRequest = ShowcaseXhr as unknown as typeof XMLHttpRequest;

  // 웹소켓으로 올라가는 길도 막는다. 위 손짓에서 `upgrades`를 비웠으므로 보통은 오지
  // 않지만, 오면 조용히 닫힌 소켓을 준다 — 실서버에 붙는 것보다 낫다.
  const RealSocket = window.WebSocket;
  class ClosedSocket extends EventTarget {
    readyState = 3;
    close(): void {}
    send(): void {}
  }
  window.WebSocket = new Proxy(RealSocket, {
    construct(target, args: [string | URL, (string | string[])?]) {
      if (isBackend(String(args[0]))) return new ClosedSocket() as unknown as WebSocket;
      return Reflect.construct(target, args) as WebSocket;
    },
  });
}
