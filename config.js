// ============================================================
// mold_survey 배포 설정 — 이 파일만 고치면 됩니다.
// ============================================================
window.SURVEY_CONFIG = {
  // 응답 수집 엔드포인트 (Google Apps Script 웹앱 URL).
  // apps_script/README.md 의 2분 배포 절차를 따른 뒤 여기에 붙여넣으세요.
  // 비워 두면: 제출 시 응답 JSON 다운로드 + 이메일 안내로 폴백됩니다(파일 업로드 문항은 숨김).
  ENDPOINT: "",

  // 보상 금액 (파일럿 피드백 후 확정. 0815 미팅: 파일럿 서베이로 금액 캘리브레이션)
  REWARD: {
    ko: { base: "5,000원 상당 기프티콘", prize: "20,000원 상당 기프티콘" },
    en: { base: "a $5 gift card", prize: "an additional $20 gift card" },
  },

  CONTACT_EMAIL: "yerim.oh@vision.snu.ac.kr",

  // 데모 링크 — 무프라이밍 원칙(P1)에 따라 배경 페이지(S3)와 종료 화면에만 노출됩니다.
  DEMO_URL: "https://yerimoh.github.io/Science_Bench/",

  // 소요 시간 안내
  MINUTES: "15",

  // 스크린샷 업로드 제한
  MAX_FILES: 2,
  MAX_FILE_MB: 3,

  VERSION: "v2-0815",
};
