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

1. **수집 백엔드 (2분, 최초 1회 · 이걸 해야 자동 저장됩니다)**: `apps_script/Code.gs` 상단 주석의 4단계를 따르세요.
   웹 앱 URL을 `config.js`의 `ENDPOINT`에 붙여넣고 push하면 끝. (URL을 브라우저로 열어 `{"ok":true}`가 보이면 정상)
   - 응답은 자동 생성되는 `mold_survey_responses` 시트에 쌓입니다.
   - **이메일은 `emails` 탭에 분리 저장** → 보상 지급 후 그 탭만 삭제하면 폐기 완료.
   - 스크린샷은 `mold_survey_uploads` Drive 폴더에 저장.

### 제출하면 무슨 일이 일어나는가 (저장 3중화)

응답이 유실되는 경우가 없도록 세 겹으로 설계했고, 셋 다 실제 서버를 띄워 테스트했습니다.

| 상황 | 동작 | 응답자가 보는 것 |
|---|---|---|
| `ENDPOINT` 설정 + 서버 정상 | POST 저장(실패 시 최대 3회 재시도), 임시저장 draft 삭제 | ✅ "응답이 저장되었습니다 (접수번호 srv-001)" |
| `ENDPOINT` 미설정 | **응답 파일이 자동으로 다운로드됨** (버튼 클릭 불필요) + 브라우저에 사본 보관 | ⚠ 안내문 + `메일로 보내기`(제목·본문 자동 완성) + 다시 내려받기 |
| 서버 장애 | 3회 재시도 후 위와 동일한 자동 파일 저장 | ⚠ 안내문 + **`다시 전송해 보기`** 버튼(서버 복구 시 그 자리에서 재전송 성공) |

즉 `ENDPOINT`가 비어 있어도 응답이 사라지지는 않지만, **수작업(응답자가 메일 보내기 → 파일 취합)이 생기므로 파일럿 전에 반드시 1번을 끝내는 것을 권장**합니다.
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
