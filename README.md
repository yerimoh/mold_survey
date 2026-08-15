# mold_survey

**AI가 수행한 연구는 어떤 흔적을 남기는가** — 몰드 커뮤니티 서베이.
**한 페이지짜리 웹페이지**입니다: 링크 하나로 열리고, 위에서 아래로 스크롤하며 답하고, 맨 아래에서 제출합니다. 상단에 한국어/English 전환 버튼이 있습니다(답은 유지된 채 문구만 바뀜, `?lang=ko|en`으로 강제 가능).

- 라이브: https://yerimoh.github.io/mold_survey/
- 설계 근거: `Science_benchmark/meeting/0927/survey_instrument_v1.md` + **0815 미팅 반영**
- 문의: yerim.oh@vision.snu.ac.kr

## 0815 미팅에서 바뀐 것 (기존 구글폼 대비)

| 항목 | 기존 구글폼 (0812) | 이 서베이 |
|---|---|---|
| 보상 | "$20 **또는 co-authorship**" | 완료 보상 + 검증 통과 프라이즈 + **사사 + Mold Hub contributor** (코어서십 문구 전면 삭제 — 김건희 교수님 방침) |
| 당위성 통계 | 없음 | S2a 신설: AI스러움 접촉 빈도(5점)·비율·맥락·**토픽 분포**·공개 링크 → "응답자 N%가 최근 1년간 AI스러움을 자주 접했다" 헤드라인용 |
| 몰드 제출 스키마 | 자유서술 2문항 | skill.md형 구조화 8필드: 이름 / 한 문장 규칙 / 위치 / **측정법** / **왜 critical** / **해결 전략** / 소거 예측 / 사례 |
| 프라이밍 통제 | 예시를 첫 화면에 노출 | 자유회상(3번)을 카드(4번) 위에 배치 + **카드에 답하기 시작하면 자유회상 잠금**(readonly, 잠근 시각 `recallLockedAt` 로깅). 예시는 합의된 2장만(논증그래프·그림색) |
| 감지 vs 명명 | 없음 | 카드 8장마다 seen / nameable / acted 분리 → `verbalization_gap` 계측 |
| 함정 카드 | 없음 | 카드 7 (한계 서술 — 실측에서 AI가 사람만큼 잘한 축) → 묵종 편향 검출 |
| 코드·실행 | 선택지 한 칸 | S5B 전용 섹션 (코드 열람 경험자에게만 분기) |
| 폼 버그 | Q12 "모두"인데 단일선택, Q13 정도 문항인데 체크박스 | 수정됨 |

구글폼으로 불가능해서 커스텀 웹페이지로 만든 것: 자유회상 잠금, 카드 순서 무작위화+순서 로깅, 조건 표시(리뷰 0편→지적 문항 숨김, 코드 경험 없음→코드 섹션 숨김), `?src=` 기관 태깅, ko/en 전환, 자동 임시저장.

**단일 페이지의 트레이드오프(알고 쓰기)**: 한 페이지라서 응답자가 아래(카드)를 먼저 훑어보고 위(자유회상)를 쓰는 것까지 막을 수는 없다. 잠금은 카드에 *답하기 시작한* 순간 걸린다. 자유회상 응답의 프라이밍 여부가 의심되면 `recallLockedAt`과 제출 시각 간격으로 사후 점검한다.

## 파일 구조

```
index.html / styles.css / app.js   # 설문 앱 (정적, 의존성 없음)
i18n.js                            # 전체 문안 ko/en — 문구 수정은 여기서만
config.js                          # ★ 배포 설정: 엔드포인트·보상 금액·연락처
assets/cards/                      # 카드 이미지 (meeting/0927/img 정본 복사본)
apps_script/Code.gs                # 응답 수집 백엔드 (Google Apps Script)
RECRUITMENT.md                     # 모집 문안 (메일/슬랙, ko/en)
```

## 배포 절차

> ### ✅ 수집 가동 중 — 응답은 구글 스프레드시트에 쌓입니다
> **주 경로**: Apps Script → `bora2267474@gmail.com` 드라이브의 **`mold_survey_responses`** 시트 (2026-08-15 라이브 제출 e2e 확인)
> **백업**: 위가 응답하지 않을 때만 `yerim.oh@vision.snu.ac.kr` 로 메일 전송 (활성화 완료)
> 둘 다 안 되면 응답자 브라우저 보류함에 보관 후 자동 재전송. 어느 경우에도 응답은 사라지지 않습니다.

## 제출된 응답 확인하기

**받는 곳**: 구글 드라이브(`bora2267474@gmail.com`)에 자동 생성된 파일 두 개

- **`mold_survey_responses` 스프레드시트**
  - `responses` 탭 — 한 행 = 한 응답. `answers_json`에 응답 전문, `totalMinutes`(4분 미만은 분석 제외), `cardOrder`(제시 순서), `honeypot`(봇 검출)
  - `emails` 탭 — 접수번호 ↔ 보상 수령 메일. **지급 끝나면 이 탭만 지우면 개인정보 폐기 완료**
- **`mold_survey_uploads` 폴더** — 응답자가 올린 스크린샷 (파일명 앞에 접수번호)

**표로 바꾸기**: 시트에서 `파일 > 다운로드 > 쉼표로 구분된 값`으로 `responses` 탭을 받은 뒤

```bash
python3 tools/responses_to_csv.py ~/Downloads/mold_survey_responses*.csv -o responses.csv
```

시트 CSV·응답 JSON·저장한 메일 어느 것이든 입력으로 받고, 중복 응답은 접수번호로 걸러집니다.

```
=== 응답 20건 요약 (논문 §3.6 naming gap) ===
몰드                   감지율     명명율     지적율   G_name   G_act
섹션 상호참조             0.85    0.20    0.10     0.65    0.10
...
```

선택지는 사람이 읽는 라벨로 변환되고, honeypot이 채워진 봇 의심 응답은 따로 표시됩니다.

1. **수집처 지정 (`config.js`의 `ENDPOINTS`)**. 둘 중 하나만 해도 되고, 둘 다 넣으면 앞의 것이 죽어도 뒤의 것으로 저장됩니다.

   | | 옵션 A — Google Apps Script (권장) | 옵션 B — FormSubmit (가장 빠름) |
   |---|---|---|
   | 필요한 작업 | `apps_script/Code.gs` 상단 4단계, 약 2분 | `config.js`에서 주석 한 줄 풀기 + 첫 제출 때 오는 확인 메일 링크 1회 클릭 |
   | 데이터 위치 | 본인 구글 스프레드시트·드라이브 (외부 유출 없음) | 응답이 메일로 옴. **제3자(formsubmit.co)를 경유** |
   | 스크린샷 첨부 | 저장됨 | 전달 안 됨(용량 제한) |
   | 설정 | `{ type: "apps_script", url: "https://script.google.com/macros/s/.../exec" }` | `{ type: "formsubmit", email: "yerim.oh@vision.snu.ac.kr" }` |
   | 현재 상태 | 미설정 (url 채우면 즉시 활성) | **켜짐 — 확인 링크 클릭만 남음** |

   지금은 B만 켜져 있어 바로 쓸 수 있습니다. 다만 응답이 20건쯤 쌓이면 메일함에서 취합하는 게 번거롭고 스크린샷도 못 받으므로,
   여유 될 때 A를 배포해 `url`만 채워 두시면 A가 주 경로가 되고 B는 자동 백업으로 남습니다.

   **왜 깃허브 커밋은 안 쓰나**: 정적 페이지에서 리포에 커밋하려면 쓰기 토큰을 공개 JS에 넣어야 하고,
   그 토큰을 주운 사람이 리포를 마음대로 고칠 수 있어 채택하지 않았습니다(응답자 이메일도 공개 리포에 그대로 남습니다).
   A 배포 후 웹앱 URL을 브라우저로 열어 `{"ok":true}`가 보이면 정상이고, 응답은 `mold_survey_responses` 시트에 쌓입니다.
   **이메일은 `emails` 탭에 분리 저장**되므로 보상 지급 후 그 탭만 지우면 폐기 완료, 스크린샷은 `mold_survey_uploads` 드라이브 폴더로 갑니다.

### 제출하면 무슨 일이 일어나는가 (응답 유실 0 설계)

네 경우 모두 실제 수집 서버를 띄워 테스트했습니다.

| 상황 | 동작 | 응답자가 보는 것 |
|---|---|---|
| 정상 | 저장(실패 시 최대 3회 재시도), draft 삭제 | ✅ "응답이 저장되었습니다 (접수번호 …)" |
| 수집처 A 장애 | **B로 자동 전환**해서 저장 | ✅ 동일 |
| 전부 불통 / 네트워크 끊김 | **보류함에 보관 → 연결 복구·페이지 재방문·60초 주기·창 닫힘(sendBeacon) 시 자동 전송.** 만약을 위해 파일도 자동 저장 | ✅ "접수되었습니다. 자동으로 전송됩니다. 따로 하실 일은 없습니다" (+ 즉시 재시도 버튼) |
| `ENDPOINTS` 미설정 | 응답 파일 자동 다운로드 + 브라우저 사본 | ⚠ `메일로 보내기`(제목·본문 자동 완성) |

즉 **수집처만 하나 지정해 두면 서버가 잠깐 죽어도 응답자가 할 일은 없습니다.** 수집처를 아예 지정하지 않으면 정적 사이트 특성상 응답이 도달할 곳이 없어서, 파일 저장 + 메일 안내가 유일한 경로가 됩니다.
2. **보상 금액 확정**: `config.js`의 `REWARD`. 현재 기본값(완료 5천 원 상당 / 통과 2만 원 상당)은 placeholder이며 **파일럿 피드백으로 확정**할 것 (0815 결정).
3. **배포 링크**: 기관별로 `?src=` 파라미터를 붙여 뿌립니다.
   - 파일럿: `...?src=pilot` / 서울대: `?src=snu` / 미네소타: `?src=umn&lang=en` / KAIST: `?src=kaist`
   - `lang=ko|en` 강제 가능 (기본은 브라우저 언어).

## 파일럿 체크리스트 (론칭 전)

- [ ] 연구실 2~3명에게 `?src=pilot`으로 돌리고: 소요 시간 실측(15분 안내가 맞는지), 보상 금액 피드백, S5 6필드가 무겁지 않은지, S5B 분기 체감
- [ ] 모바일에서 카드 이미지 좌우 대조가 읽히는지 확인
- [ ] Apps Script 시트에 응답·이메일 분리 저장 확인, 업로드 확인
- [ ] 응답 후 `responses` 시트에서 시작~제출 소요시간이 비정상적으로 짧은(4분 미만) 건 제외 규칙 확인
- [ ] 영어 배포 전: 카드 이미지가 한국어라 EN 모드는 캡션으로 보완 중 — 필요하면 `meeting/0927/img/make_cards*.py`로 EN 카드 재생성

## 카드 커버리지 (artifact-ai2science 4패밀리 대비)

카드 10장 = **논문 provisional registry 7종 전부** + FFM + 함정 카드 + execution:

| 카드 | 몰드 | 근거 |
|---|---|---|
| crn | Structural/Cross-Reference_Network | registry L3 |
| mr | Structural/Macro_Redundancy | registry L2 |
| pb | Content/Problem_Borrowing | registry L3 |
| esa | Content/Evaluation_Surface_Area | registry L3 |
| cp | Content/Comparative_Positioning | registry L3 |
| bs | Content/Baseline_Sandbagging | registry L3 (v3에서 추가) |
| eng | Cross-output/External_Number_Grounding | registry L3† (v3에서 추가) |
| ffm | Cross-output/new_Figure_Format_Monotony | hunt0727 시각화 flagship |
| trap | (몰드 아님) 한계 서술 | 묵종 편향 검출용, 실측에선 AI가 사람만큼 잘함 |
| exec | Execution (Plan_Execution_Gap+Success_Theater) | 실행 몰드, S5B에서 전수 보완 |

**의도적으로 카드가 아닌 것**: Argument_Graph와 Visualization(색)은 S2b 예시 2장으로 소진(프라이밍 제외 축, SECTION1_EXAMPLES 합의). AI_Writing_Style은 논문의 negative control이라 제외. Method는 0710 감사에서 드랍. 나머지 new_ 계열 9개(Manufactured_Gap_Framing, Caption_Compensation, Foundational_Amnesia, NonDataInk_Dominance, Document_Rhythm_Flatness, Frame_Scaffolding, Given_New_Violation, Logical_Chain_Sparsity, Rhetorical_Reversal)는 검증 미완이라 카드 자격 미달, 서베이 S5로 커뮤니티 검증 수요를 받는 쪽.

## 몰드 정의를 응답자에게 어떻게 제시하는가

자유회상 문항 위 정의 상자에 **0815 미팅에서 확정한 세 축**(녹취 §140·143 "세퍼레이션 글로벌리티 로버스트니스 이렇게 세 가지 축")을 응답자 언어로 풀어 제시합니다.
기존 구글폼의 분리성·전역성·강건성 항목을 잇되, 강건성은 "프롬프트 한 번으로 안 지워진다"만으로는 뜻이 전달되지 않아
**무엇이 문제인지 짚어주고 여러 번 반복해 고쳐 써도 남아야 하며, 저희는 실제로 5~10라운드를 돌린다**까지 밝힙니다.

이로써 자유회상은 엄밀한 의미의 criteria-blind가 아닙니다. 대신 얻는 것이 큽니다. 기준을 감추면 "delve를 자주 쓴다" 같은
표면 응답이 대부분이 되고, 그건 논문이 명시적으로 배제하는 층위입니다(§1 "surface language is polished"). 반대로
**naming gap(G_name, G_act)은 카드별 seen/named/acted에서 계산**하므로 이 결정에 영향을 받지 않습니다.
분석 시에는 자유회상 응답을 "세 축을 안내받은 상태의 회상"으로 기술해야 합니다.

## 빈도 문항의 지시대상이 바뀐 점 (해석 주의)

`d_freq`·`d_share`·`d_context`·`d_topics`는 원래 "AI가 크게 관여한 것 같은 논문"을 얼마나 자주 보는지를 물었고,
지금은 **응답자가 직전에 직접 적은 몰드**를 얼마나 자주 마주치는지를 묻습니다(문항 순서도 자유회상 뒤로 옮겼습니다).
변수 이름과 선택지는 그대로여서 분석 코드는 영향이 없지만, 논문에 쓸 때 문장이 달라집니다.

- 이전: "응답자의 N%가 AI스러운 논문을 자주 접한다" (막연한 AI스러움)
- 지금: "**응답자의 N%가 자신이 지목한 몰드를 자주 마주친다**" (몰드가 실재한다는 더 강한 주장)

`d_topics`도 "그 몰드가 보였던 논문들의 분야"가 되어, 몰드별 토픽 분포로 쓸 수 있습니다.

## 분석 시 주의 (사전 등록 사항)

- **프라이밍 제외 축**: S2b 예시로 보여준 두 축(서론 논증 구조, 그림 색)은 자유회상 분석에서 프라이밍된 것으로 표시하고 감지율 대 명명율 격차 지표에서 제외 (`SECTION1_EXAMPLES.md` 합의).
- **함정 카드**: `trap`(한계 서술)은 실측에서 AI가 사람만큼/더 잘한 축. seen이 높게 나오면 통념 응답 신호 → 해당 응답자의 다른 카드 응답 가중치 하향 검토.
- **품질 필터**: honeypot 채워짐 / startedAt~submittedAt 4분 미만 / r_p1 20자 미만 우회 시도 → 제외. 자유회상 프라이밍 의심 건은 `recallLockedAt` 참조.
- **응답자 층화**: 역할(role) 학부·석사는 별도 층으로 분리 가능하게 저장됨 (0815: 주 분석 대상은 박사과정 이상, 폼에서 배제하지는 않음).
- 카드별 응답 컬럼은 `c_{crn|pb|mr|esa|cp|ffm|trap|exec}_{seen|named|acted}`. `cardOrder`에 제시 순서가 남으므로 순서 효과 통제 가능.
- 선택지는 **인덱스(0부터)로 저장**됩니다. 라벨 매핑은 `i18n.js`가 정본.

## verbalization_gap 산식 (참고)

```
verbalization_gap(mold) = P(seen ≥ 3) − P(named == 0)   # named 0 = "설명할 수 있었다"
acted_gap(mold)        = P(seen ≥ 3) − P(acted == 0)    # 리뷰 경험자만
```
