"""컬럼 단위 암호화 — 기획서 §9.2.

DB나 백업이 유출됐을 때 **암호문만 나가야** 이 계층이 의미가 있다.
"""

import pytest

from app.infrastructure.security.crypto import (
    CryptoError,
    FieldCipher,
    generate_key,
    load_key,
)


def _cipher() -> FieldCipher:
    return FieldCipher(load_key(generate_key()))


def test_roundtrip() -> None:
    c = _cipher()
    for value in ("김판수", "1975-03-02", "재산·경제범죄", "a" * 500):
        assert c.decrypt(c.encrypt(value)) == value


def test_same_plaintext_gives_different_ciphertext() -> None:
    """논스가 매번 새로 생긴다. 그래서 **암호화된 컬럼으로는 검색도 정렬도 못 한다** —
    이름으로 사용자를 찾는 기능은 이 구조에서 만들 수 없고, 의도한 제약이다."""
    c = _cipher()
    assert c.encrypt("김판수") != c.encrypt("김판수")


def test_ciphertext_does_not_contain_plaintext() -> None:
    assert "김판수" not in _cipher().encrypt("김판수")


def test_other_key_cannot_read() -> None:
    """키가 코드·레포와 분리 보관되는 이유다. DB만 가져가면 읽지 못한다."""
    sealed = _cipher().encrypt("재산·경제범죄")
    with pytest.raises(CryptoError):
        _cipher().decrypt(sealed)


def test_tampered_ciphertext_is_rejected() -> None:
    """GCM이 무결성까지 본다 — 조용히 깨진 평문이 나오는 일은 없다."""
    c = _cipher()
    sealed = c.encrypt("김판수")
    broken = sealed[:-4] + ("AAAA" if not sealed.endswith("AAAA") else "BBBB")
    with pytest.raises(CryptoError):
        c.decrypt(broken)


def test_missing_key_stops_boot() -> None:
    """키가 없다고 평문으로 저장하는 폴백은 두지 않는다 — 그 폴백이 있으면
    설정 하나 빠뜨렸을 때 조용히 평문 DB가 만들어진다."""
    with pytest.raises(CryptoError, match="암호화 키가 없다"):
        load_key("")


def test_wrong_key_size_is_rejected() -> None:
    import base64

    with pytest.raises(CryptoError, match="32바이트"):
        load_key(base64.b64encode(b"short").decode())


def test_error_does_not_leak_the_value() -> None:
    """예외 메시지가 로그로 흘러가므로 원문도 키도 담지 않는다."""
    sealed = _cipher().encrypt("김판수")
    with pytest.raises(CryptoError) as exc:
        _cipher().decrypt(sealed)
    assert "김판수" not in str(exc.value)
