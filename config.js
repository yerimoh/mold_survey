// ============================================================
// mold_survey 배포 설정 — 이 파일만 고치면 됩니다.
// ============================================================
window.SURVEY_CONFIG = {
  // ── 응답 수집처 ────────────────────────────────────────────────
  // 위에서부터 차례로 시도하고, 하나라도 성공하면 저장 완료로 처리합니다.
  // 전부 실패하면 응답은 보류함에 쌓였다가 연결이 돌아올 때 자동으로 재전송됩니다.
  //
  // 옵션 A (권장) — Google Apps Script: 데이터가 본인 구글 계정 밖으로 안 나갑니다.
  //   apps_script/Code.gs 상단 4단계(약 2분) → 발급된 웹앱 URL을 url에 붙여넣기
  //     { type: "apps_script", url: "https://script.google.com/macros/s/..../exec" }
  //
  // 옵션 B (가장 빠름) — FormSubmit: 가입 없이 응답이 메일로 옵니다.
  //   아래 줄의 주석만 풀면 끝. 첫 제출 때 그 주소로 확인 메일이 한 번 오는데,
  //   그 링크를 클릭해야 이후 응답이 실제로 전달됩니다(1회만).
  //   주의: 응답 내용이 제3자 서비스(formsubmit.co)를 거칩니다.
  //     { type: "formsubmit", email: "yerim.oh@vision.snu.ac.kr" }
  //
  // 둘 다 넣어 두면 A가 죽어도 B로 저장되므로 가장 안전합니다.
  ENDPOINTS: [
    // A. 켜려면 배포 후 url만 채우면 됩니다. 채워지면 이쪽이 먼저 쓰이고, 실패 시 B로 넘어갑니다.
    // { type: "apps_script", url: "" },

    // B. 활성화 완료되면 응답이 이 주소로 메일 전송됩니다. (서버 불필요)
    { type: "formsubmit", email: "yerim.oh@vision.snu.ac.kr" },
  ],

  // (구버전 호환) 단일 Apps Script URL. ENDPOINTS가 비어 있을 때만 사용됩니다.
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

  VERSION: "v3-0815", // v3: 카드 8→10장 (레지스트리 7종 완비 + BS/ENG 추가), 카드 설명문 신설

};
