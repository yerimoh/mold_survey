#!/usr/bin/env python3
"""메일/파일로 받은 mold_survey 응답을 표(CSV)와 요약 통계로 바꿉니다.

사용법
    # 메일 본문을 통째로 저장한 파일들, 또는 응답 JSON 파일들
    python3 tools/responses_to_csv.py inbox/*.eml downloads/*.json -o responses.csv

입력으로 받는 것
    1) 설문이 만든 응답 JSON 파일 (mold_survey_<접수번호>.json)
    2) FormSubmit이 보낸 메일을 저장한 파일(.eml/.txt). 본문의 payload_json 값을 자동으로 찾아냅니다.

출력
    - responses.csv : 한 행 = 한 응답, 선택지는 사람이 읽는 라벨로 변환
    - 화면에 논문 §3.6용 요약: 몰드별 감지율/명명율/지적율과 naming gap
"""
import argparse, csv, json, re, sys
from pathlib import Path

# i18n.js의 ko 라벨을 그대로 옮긴 코드북. 문항을 고치면 여기도 같이 고치세요.
CODEBOOK = {
    "role": ["학부생", "석사과정", "박사과정", "포스닥", "교수", "산업계 연구자", "기타"],
    "review_count": ["0편", "1~5편", "6~20편", "21~50편", "50편 이상"],
    "field": ["ML/AI 일반", "NLP", "CV", "시스템·이론", "생명·의학", "화학·재료", "물리·지구·천문", "기타"],
    "llm_use": ["전혀 안 씀", "문법 교정", "문단 다시 쓰기", "초안 작성", "아이디어와 실험 설계까지"],
    "ai_tools": ["ChatGPT", "Claude", "Gemini", "코딩 보조", "코딩 에이전트", "Deep Research", "쓰지 않음", "기타"],
    "code_exposure": ["자주 있다", "몇 번 있다", "거의 없다", "전혀 없다"],
    "d_freq": ["전혀 없었다", "한두 번", "가끔", "자주", "거의 볼 때마다"],
    "d_share": ["0%", "10% 미만", "10~30%", "30~60%", "60% 이상", "가늠 어려움"],
    "d_context": ["심사 중 원고", "공개 논문", "동료·학생 원고", "과제 보고서", "기타"],
    "verb": ["쉽게 적었다", "조금 애먹었다", "느낌은 분명한데 말이 안 나왔다", "결국 못 적었다"],
    "named": ["설명할 수 있었다", "느낌만 있었다", "카드 보고 처음"],
    "acted": ["있다", "없다"],
    "erase": ["쉽게 지워질 것", "몇 번 고치면", "반복해도 안 없어질 것", "모르겠다"],
    "where": ["초록", "서론", "방법", "실험", "그림·표", "코드", "실험 로그", "여러 곳"],
    "b_seen": ["안 돌린 결과를 돌린 것처럼", "실행했는데 반영 안 됨", "진단해놓고 안 함",
               "시키지 않으면 검증 안 함", "실패를 성공처럼", "설정값 하드코딩", "구조가 획일적", "본 적 없음"],
    "bottleneck": ["내가 말로 설명 못 해서", "AI가 알아보지 못해서", "둘 다", "요청해본 적 없음"],
    "next_round": ["예", "내용에 따라", "아니오"],
    "ack": ["예", "아니오"],
    "notify": ["예", "아니오"],
}
MOLDS = ["crn", "pb", "mr", "esa", "cp", "bs", "eng", "ffm", "trap", "exec"]
MOLD_KO = {"crn": "섹션 상호참조", "pb": "문제 단일출처", "mr": "거시 중복", "esa": "평가 면적",
           "cp": "비교 위치짓기", "bs": "베이스라인 축소", "eng": "외부 수치 접지",
           "ffm": "그림 형식 단조", "trap": "(함정)한계 서술", "exec": "실행 갭"}


def label(key, val):
    opts = CODEBOOK.get(key)
    if opts is None or val is None:
        return val
    if isinstance(val, list):
        return " | ".join(opts[i] if 0 <= i < len(opts) else str(i) for i in val)
    if isinstance(val, int) and 0 <= val < len(opts):
        return opts[val]
    return val


def extract_payloads(path: Path):
    """파일 하나에서 응답 dict를 최대한 뽑아냅니다(JSON 파일이든 메일 본문이든)."""
    raw = path.read_text(errors="replace")
    out = []
    # 1) 응답 JSON 파일 그대로
    try:
        obj = json.loads(raw)
        if isinstance(obj, dict) and "answers" in obj:
            return [obj]
    except Exception:
        pass
    # 2) 메일 본문에 들어 있는 payload_json
    for m in re.finditer(r'payload_json["\s:=]*\s*(\{.*?\})\s*(?:\n\n|\r\n\r\n|$)', raw, re.S):
        try:
            out.append(json.loads(m.group(1)))
        except Exception:
            continue
    if out:
        return out
    # 3) 최후: 파일 안의 가장 큰 JSON 객체
    best = None
    for m in re.finditer(r"\{.*\}", raw, re.S):
        s = m.group(0)
        try:
            o = json.loads(s)
        except Exception:
            continue
        if isinstance(o, dict) and "answers" in o and (best is None or len(s) > len(best)):
            best = s
    if best:
        out.append(json.loads(best))
    return out


def flatten(p):
    a = p.get("answers", {}) or {}
    row = {
        "respId": p.get("clientRespId", ""),
        "submittedAt": p.get("submittedAt", ""),
        "startedAt": p.get("startedAt", ""),
        "recallLockedAt": p.get("recallLockedAt", ""),
        "lang": p.get("lang", ""),
        "src": p.get("src", ""),
        "cardOrder": " ".join(p.get("cardOrder", []) or []),
    }
    try:
        from datetime import datetime
        s = datetime.fromisoformat(p["startedAt"].replace("Z", "+00:00"))
        e = datetime.fromisoformat(p["submittedAt"].replace("Z", "+00:00"))
        row["minutes"] = round((e - s).total_seconds() / 60, 1)
    except Exception:
        row["minutes"] = ""
    for k in ["role", "review_count", "field", "llm_use", "ai_tools", "code_exposure",
              "d_freq", "d_share", "d_context"]:
        row[k] = label(k, a.get(k))
    row["d_topics"] = a.get("d_topics", "")
    row["d_links"] = a.get("d_links", "")
    for i in (1, 2, 3):
        row[f"recall_{i}"] = a.get(f"r_p{i}", "")
        row[f"recall_{i}_verb"] = label("verb", a.get(f"r_v{i}"))
    row["recall_contrast"] = a.get("r_contrast", "")
    for m in MOLDS:
        row[f"{m}_seen"] = a.get(f"c_{m}_seen")
        row[f"{m}_named"] = label("named", a.get(f"c_{m}_named"))
        row[f"{m}_acted"] = label("acted", a.get(f"c_{m}_acted"))
    row["top2"] = " | ".join(a.get("w_top2_keys", []) or [])
    row["doubt"] = a.get("w_doubt", "")
    for c in ("m1", "m2"):
        row[f"{c}_name"] = a.get(f"{c}_name", "")
        row[f"{c}_rule"] = a.get(f"{c}_rule", "")
        row[f"{c}_where"] = label("where", a.get(f"{c}_where"))
        row[f"{c}_count"] = a.get(f"{c}_count", "")
        row[f"{c}_why"] = a.get(f"{c}_why", "")
        row[f"{c}_fix"] = a.get(f"{c}_fix", "")
        row[f"{c}_erase"] = label("erase", a.get(f"{c}_erase"))
        row[f"{c}_example"] = a.get(f"{c}_example", "")
    row["b_code"] = a.get("b_code", "")
    row["b_seen"] = label("b_seen", a.get("b_seen"))
    row["b_only"] = a.get("b_only", "")
    row["unverbal"] = a.get("q_unverbal", "")
    row["askedfix"] = a.get("q_askedfix", "")
    row["bottleneck"] = label("bottleneck", a.get("q_bottleneck"))
    row["converge"] = a.get("q_converge", "")
    row["ai_ok"] = a.get("q_ai_ok", "")
    row["human_must"] = a.get("q_human_must", "")
    row["next_round"] = label("next_round", a.get("next_round"))
    row["ack"] = label("ack", a.get("ack"))
    row["comments"] = a.get("comments", "")
    row["honeypot"] = p.get("honeypot", "")
    return row


def summarize(payloads):
    n = len(payloads)
    print(f"\n=== 응답 {n}건 요약 (논문 §3.6 naming gap) ===")
    print(f"{'몰드':<16}{'감지율':>8}{'명명율':>8}{'지적율':>8}{'G_name':>9}{'G_act':>8}")
    for m in MOLDS:
        seen = named = acted = n_act = 0
        for p in payloads:
            a = p.get("answers", {}) or {}
            if isinstance(a.get(f"c_{m}_seen"), int) and a[f"c_{m}_seen"] >= 3:
                seen += 1
            if a.get(f"c_{m}_named") == 0:      # "설명할 수 있었다"
                named += 1
            if a.get(f"c_{m}_acted") is not None:
                n_act += 1
                if a.get(f"c_{m}_acted") == 0:  # "있다"
                    acted += 1
        ps, pn = seen / n, named / n
        pa = acted / n_act if n_act else float("nan")
        print(f"{MOLD_KO[m]:<16}{ps:>8.2f}{pn:>8.2f}{pa:>8.2f}{ps-pn:>9.2f}{pn-pa:>8.2f}")
    print("\n감지율 = 본 적 있다(0~4 중 3 이상) 비율 · 명명율 = 카드 전에 설명할 수 있었다 비율")
    print("지적율 = 리뷰에서 실제로 지적한 비율(리뷰 경험자 기준)")
    quick = [p for p in payloads if p.get("honeypot")]
    if quick:
        print(f"\n⚠ 봇 의심(honeypot 채워짐) {len(quick)}건: " + ", ".join(p.get("clientRespId", "?") for p in quick))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+", help="응답 JSON 또는 저장한 메일 파일")
    ap.add_argument("-o", "--out", default="responses.csv")
    args = ap.parse_args()

    payloads, seen_ids = [], set()
    for f in args.files:
        for p in extract_payloads(Path(f)):
            rid = p.get("clientRespId") or p.get("submittedAt")
            if rid in seen_ids:          # 같은 응답이 메일과 파일로 겹쳐 들어온 경우
                continue
            seen_ids.add(rid)
            payloads.append(p)
    if not payloads:
        sys.exit("응답을 하나도 찾지 못했습니다. 메일 본문 전체를 저장했는지 확인하세요.")

    rows = [flatten(p) for p in payloads]
    cols = list(rows[0].keys())
    with open(args.out, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=cols)
        w.writeheader()
        w.writerows(rows)
    print(f"✅ {len(rows)}건 → {args.out}")
    summarize(payloads)


if __name__ == "__main__":
    main()
