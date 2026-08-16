/**
 * mold_survey 응답 수집 백엔드 (Google Apps Script)
 *
 * 배포 (약 2분): apps_script/DEPLOY.md 참고.
 *  - 액세스 권한은 반드시 "모든 사용자"("Google 계정이 있는 모든 사용자" 아님)
 *  - 웹 앱 URL을 브라우저로 열어 {"ok":true} 가 보이면 정상
 *
 * ★ 이 파일을 고친 뒤에는 반드시 다시 배포해야 반영됩니다:
 *   배포 > 배포 관리 > 연필(수정) > 버전 "새 버전" > 배포  (URL은 그대로 유지)
 *
 * 저장되는 것 (내 드라이브에 자동 생성):
 *  - "mold_survey_responses" 스프레드시트
 *      responses 탭 : 한 행 = 한 응답, **한 문항 = 한 열**, 선택지는 사람이 읽는 라벨로 변환
 *      emails 탭    : 접수번호 ↔ 이메일 (보상 지급용). 지급 후 이 탭만 지우면 개인정보 폐기 완료
 *  - "mold_survey_uploads" 폴더 : 스크린샷 (파일명 앞에 접수번호)
 *
 * 열 구성을 바꾸면(문항 추가 등) 기존 responses 탭은 자동으로 보관 처리되고
 * 새 헤더로 새 탭이 만들어집니다. 예전 응답이 사라지지는 않습니다.
 */

var SS_NAME = "mold_survey_responses";
var FOLDER_NAME = "mold_survey_uploads";

// 카드 제시 순서와 무관하게 열 순서는 고정한다.
var MOLDS = ["crn", "pb", "mr", "esa", "cp", "bs", "eng", "ffm", "trap", "exec"];
var MOLD_KO = {
  crn: "섹션상호참조", pb: "문제단일출처", mr: "거시중복", esa: "평가면적", cp: "비교위치짓기",
  bs: "베이스라인축소", eng: "외부수치접지", ffm: "그림형식단조", trap: "함정_한계서술", exec: "실행갭"
};

// 선택지 라벨 (설문 i18n.js의 한국어 라벨과 같은 순서)
var CODEBOOK = {
  role: ["학부생", "석사과정", "박사과정", "포스닥", "교수", "산업계 연구자", "기타"],
  review_count: ["0편", "1~5편", "6~20편", "21~50편", "50편 이상"],
  field: ["ML/AI 일반", "NLP", "CV", "시스템·이론", "생명·의학", "화학·재료", "물리·지구·천문", "기타"],
  llm_use: ["전혀 안 씀", "문법 교정", "문단 다시 쓰기", "초안 작성", "아이디어와 실험 설계까지"],
  ai_tools: ["ChatGPT", "Claude", "Gemini", "코딩 보조", "코딩 에이전트", "Deep Research", "쓰지 않음", "기타"],
  code_exposure: ["자주 있다", "몇 번 있다", "거의 없다", "전혀 없다"],
  d_freq: ["전혀 없었다", "한두 번", "가끔", "자주", "거의 볼 때마다"],
  d_share: ["0%", "10% 미만", "10~30%", "30~60%", "60% 이상", "가늠 어려움"],
  d_context: ["심사 중 원고", "공개 논문", "동료·학생 원고", "과제 보고서", "기타"],
  verb: ["쉽게 적었다", "조금 애먹었다", "느낌은 분명한데 말이 안 나왔다", "결국 못 적었다"],
  named: ["설명할 수 있었다", "느낌만 있었다", "카드 보고 처음"],
  acted: ["있다", "없다"],
  where: ["초록", "서론", "방법", "실험", "그림·표", "코드", "실험 로그", "여러 곳"],
  erase: ["쉽게 지워질 것", "몇 번 고치면", "반복해도 안 없어질 것", "모르겠다"],
  b_seen: ["안 돌린 결과를 돌린 것처럼", "실행했는데 반영 안 됨", "진단해놓고 안 함",
           "시키지 않으면 검증 안 함", "실패를 성공처럼", "설정값 하드코딩", "구조가 획일적", "본 적 없음"],
  bottleneck: ["내가 말로 설명 못 해서", "AI가 알아보지 못해서", "둘 다", "요청해본 적 없음"],
  next_round: ["예", "내용에 따라", "아니오"],
  ack: ["예", "아니오"],
  notify: ["예", "아니오"]
};

/** 한 문항 = [응답 키, 열 이름, 라벨 코드북(없으면 원값)] */
function fieldSpec_() {
  var f = [
    ["role", "역할", "role"],
    ["role_other", "역할_기타", null],
    ["review_count", "심사편수", "review_count"],
    ["field", "분야", "field"],
    ["field_other", "분야_기타", null],
    ["llm_use", "LLM사용도", "llm_use"],
    ["ai_tools", "사용도구", "ai_tools"],
    ["ai_tools_other", "사용도구_기타", null],
    ["code_exposure", "코드열람경험", "code_exposure"],

    ["r_p1", "몰드1", null], ["r_v1", "몰드1_표현난이도", "verb"],
    ["r_p2", "몰드2", null], ["r_v2", "몰드2_표현난이도", "verb"],
    ["r_p3", "몰드3", null], ["r_v3", "몰드3_표현난이도", "verb"],
    ["q_unverbal", "말로못옮긴것", null],
    ["r_contrast", "사람논문대조", null],

    ["d_freq", "마주친빈도", "d_freq"],
    ["d_share", "마주친비율", "d_share"],
    ["d_context", "마주친맥락", "d_context"],
    ["d_context_other", "마주친맥락_기타", null],
    ["d_topics", "토픽", null],
    ["d_links", "링크", null]
  ];
  ["m1", "m2"].forEach(function (c) {
    var n = (c === "m1") ? "제안1" : "제안2";
    f.push([c + "_name", n + "_이름", null]);
    f.push([c + "_rule", n + "_한문장규칙", null]);
    f.push([c + "_where", n + "_위치", "where"]);
    f.push([c + "_count", n + "_측정법", null]);
    f.push([c + "_why", n + "_왜중요", null]);
    f.push([c + "_fix", n + "_해결전략", null]);
    f.push([c + "_erase", n + "_소거예측", "erase"]);
    f.push([c + "_example", n + "_사례", null]);
  });
  MOLDS.forEach(function (m) {
    f.push(["c_" + m + "_seen", MOLD_KO[m] + "_감지0_4", null]);
    f.push(["c_" + m + "_named", MOLD_KO[m] + "_명명", "named"]);
    f.push(["c_" + m + "_acted", MOLD_KO[m] + "_지적", "acted"]);
  });
  f.push(["w_top2_keys", "공감top2", null]);
  f.push(["w_doubt", "AI고유아님_의견", null]);
  f.push(["w_new_idea", "카드후_새몰드", null]);
  f.push(["q_bottleneck", "안고쳐진원인", "bottleneck"]);
  f.push(["b_code", "AI코드_이상한점", null]);
  f.push(["b_seen", "실행목격항목", "b_seen"]);
  f.push(["b_only", "코드에서만보이는것", null]);
  f.push(["next_round", "다음라운드참여", "next_round"]);
  f.push(["ack", "사사동의", "ack"]);
  f.push(["notify", "결과통보", "notify"]);
  f.push(["comments", "하고싶은말", null]);
  return f;
}

var META_HEADERS = ["접수번호", "clientRespId", "제출시각", "시작시각", "소요분", "회상잠금시각",
                    "언어", "채널", "버전", "카드순서", "honeypot", "첨부수", "첨부링크"];
var TAIL_HEADERS = ["answers_json", "pageTimes_json", "ua", "screen"];
var EMAIL_HEADERS = ["접수번호", "제출시각", "이메일", "사사동의", "표기명", "결과통보", "다음라운드"];

function headers_() {
  return META_HEADERS
    .concat(fieldSpec_().map(function (x) { return x[1]; }))
    .concat(TAIL_HEADERS);
}

function label_(codebookKey, val) {
  if (val === undefined || val === null || val === "") return "";
  var opts = codebookKey ? CODEBOOK[codebookKey] : null;
  if (Object.prototype.toString.call(val) === "[object Array]") {
    return val.map(function (v) {
      return (opts && typeof v === "number" && opts[v] !== undefined) ? opts[v] : v;
    }).join(" | ");
  }
  if (opts && typeof val === "number" && opts[val] !== undefined) return opts[val];
  return val;
}

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SS_ID");
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { }
  }
  var ss = SpreadsheetApp.create(SS_NAME);
  props.setProperty("SS_ID", ss.getId());
  return ss;
}

function getFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("FOLDER_ID");
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { }
  }
  var f = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty("FOLDER_ID", f.getId());
  return f;
}

/** 헤더가 바뀌었으면 기존 탭을 보관 처리하고 새 탭을 만든다(데이터는 보존). */
function getSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (sh) {
    var width = sh.getLastColumn();
    var cur = width ? sh.getRange(1, 1, 1, width).getValues()[0] : [];
    if (cur.join(" ") !== headers.join(" ")) {
      sh.setName(name + "_old_" + Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd_HHmmss"));
      sh = null;
    }
  }
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }
  return sh;
}

function doPost(e) {
  var out = { ok: false };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents);
    var answers = data.answers || {};
    var respId = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd-HHmmss") +
                 "-" + Math.random().toString(36).slice(2, 7);

    // 1) 첨부 저장
    var fileLinks = [];
    var files = data.files || [];
    if (files.length) {
      var folder = getFolder_();
      for (var i = 0; i < files.length && i < 4; i++) {
        try {
          var m = String(files[i].dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
          if (!m) continue;
          var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1],
                                       respId + "_" + (files[i].name || ("upload" + i)));
          fileLinks.push(folder.createFile(blob).getUrl());
        } catch (fe) { fileLinks.push("upload_error"); }
      }
    }

    var totalMin = "";
    try {
      if (data.startedAt && data.submittedAt) {
        totalMin = Math.round((new Date(data.submittedAt) - new Date(data.startedAt)) / 6000) / 10;
      }
    } catch (te) { }

    // 2) 문항별 열로 펼치기 (이메일과 표기명은 제외 → emails 탭에만)
    var spec = fieldSpec_();
    var row = [
      respId, data.clientRespId || "", data.submittedAt || "", data.startedAt || "", totalMin,
      data.recallLockedAt || "", data.lang || "", data.src || "", data.version || "",
      (data.cardOrder || []).join(" "), data.honeypot || "", files.length, fileLinks.join(" ")
    ];
    spec.forEach(function (f) { row.push(label_(f[2], answers[f[0]])); });

    var rest = {};
    for (var k in answers) {
      if (k === "email" || k === "ack_name") continue;
      rest[k] = answers[k];
    }
    row.push(JSON.stringify(rest));                       // 원본 보관용
    row.push(JSON.stringify(data.pageTimesMs || {}));
    row.push(data.ua || "");
    row.push(data.screen || "");

    var ss = getSpreadsheet_();
    getSheet_(ss, "responses", headers_()).appendRow(row);
    getSheet_(ss, "emails", EMAIL_HEADERS).appendRow([
      respId, data.submittedAt || "", answers.email || "",
      label_("ack", answers.ack), answers.ack_name || "",
      label_("notify", answers.notify), label_("next_round", answers.next_round)
    ]);

    out = { ok: true, respId: respId };
  } catch (err) {
    out = { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// 상태 확인용: 웹 앱 URL을 브라우저로 열면 ok가 보입니다.
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: "mold_survey collector" }))
    .setMimeType(ContentService.MimeType.JSON);
}
