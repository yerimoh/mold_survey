/**
 * mold_survey 응답 수집 백엔드 (Google Apps Script)
 *
 * 배포 (약 2분):
 *  1. https://script.google.com → 새 프로젝트 → 이 파일 내용 붙여넣기
 *  2. 배포 > 새 배포 > 유형: 웹 앱
 *     - 실행 계정: 나
 *     - 액세스 권한: 모든 사용자 (Anyone)
 *  3. 발급된 웹 앱 URL을 mold_survey 리포의 config.js ENDPOINT에 붙여넣고 push
 *
 * 배포 확인: 웹 앱 URL을 브라우저로 열어 {"ok":true} 가 보이면 정상입니다.
 * 이 URL을 config.js ENDPOINT에 넣기 전까지는, 설문 제출 시 응답이 서버에 저장되지 않고
 * 응답자 PC에 파일로 자동 저장된 뒤 메일로 보내도록 안내됩니다(유실은 없지만 수작업이 늘어남).
 *
 * 동작:
 *  - 첫 요청 시 "mold_survey_responses" 스프레드시트와 "mold_survey_uploads" Drive 폴더를 자동 생성
 *  - responses 시트: 이메일을 제외한 응답 전체 (분석용)
 *  - emails 시트: respId ↔ 이메일 (보상 지급용, 지급 후 이 시트만 삭제하면 분리 폐기 완료)
 *  - 업로드 스크린샷: Drive 폴더에 respId 접두사로 저장
 */

var SS_NAME = "mold_survey_responses";
var FOLDER_NAME = "mold_survey_uploads";

function getSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("SS_ID");
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* recreate below */ }
  }
  var ss = SpreadsheetApp.create(SS_NAME);
  props.setProperty("SS_ID", ss.getId());
  return ss;
}

function getFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty("FOLDER_ID");
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* recreate below */ }
  }
  var f = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty("FOLDER_ID", f.getId());
  return f;
}

function getSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

var RESP_HEADERS = [
  "respId", "clientRespId", "submittedAt", "startedAt", "recallLockedAt", "lang", "src", "version",
  "totalMinutes", "cardOrder", "honeypot", "nFiles", "fileLinks",
  "answers_json", "pageTimes_json", "ua", "screen",
];
var EMAIL_HEADERS = ["respId", "submittedAt", "email", "ack", "ack_name", "notify", "next_round"];

function doPost(e) {
  var out = { ok: false };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var data = JSON.parse(e.postData.contents);
    var respId = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyyMMdd-HHmmss") + "-" + Math.random().toString(36).slice(2, 7);

    // 1) save uploaded screenshots to Drive
    var fileLinks = [];
    var files = data.files || [];
    if (files.length) {
      var folder = getFolder_();
      for (var i = 0; i < files.length && i < 4; i++) {
        try {
          var m = String(files[i].dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
          if (!m) continue;
          var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], respId + "_" + (files[i].name || "upload" + i));
          fileLinks.push(folder.createFile(blob).getUrl());
        } catch (fe) { fileLinks.push("upload_error"); }
      }
    }

    // 2) split answers: email → separate sheet, rest → responses sheet
    var answers = data.answers || {};
    var email = answers.email || "";
    var ackName = answers.ack_name || "";
    var rest = {};
    for (var k in answers) {
      if (k === "email" || k === "ack_name") continue;
      rest[k] = answers[k];
    }

    var totalMin = "";
    try {
      if (data.startedAt && data.submittedAt) {
        totalMin = Math.round((new Date(data.submittedAt) - new Date(data.startedAt)) / 6000) / 10;
      }
    } catch (te) { }

    var ss = getSpreadsheet_();
    var respSh = getSheet_(ss, "responses", RESP_HEADERS);
    respSh.appendRow([
      respId, data.clientRespId || "", data.submittedAt || "", data.startedAt || "", data.recallLockedAt || "", data.lang || "", data.src || "", data.version || "",
      totalMin, JSON.stringify(data.cardOrder || []), data.honeypot || "", files.length, fileLinks.join(" "),
      JSON.stringify(rest), JSON.stringify(data.pageTimesMs || {}), data.ua || "", data.screen || "",
    ]);

    var emailSh = getSheet_(ss, "emails", EMAIL_HEADERS);
    emailSh.appendRow([respId, data.submittedAt || "", email, answers.ack, ackName, answers.notify, answers.next_round]);

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
