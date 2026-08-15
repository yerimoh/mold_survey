#!/usr/bin/env bash
# 배포한 웹 앱이 외부에서 접근 가능한지 30초 만에 확인합니다.
#   ./check.sh "https://script.google.com/macros/s/..../exec"
set -u
U="${1:-}"
[ -z "$U" ] && { echo "사용법: ./check.sh '<웹앱 URL(/exec로 끝나는 것)>'"; exit 1; }

echo "== GET 확인 =="
BODY=$(curl -sL "$U")
if printf '%s' "$BODY" | grep -q '"ok":true'; then
  echo "✅ 외부 접근 OK — $BODY"
else
  if printf '%s' "$BODY" | grep -qi 'accounts.google.com/v3/signin\|파일을 열 수 없습니다\|Page Not Found'; then
    echo "❌ 외부에서 못 엽니다. 배포 > 배포 관리 > 연필(수정) > '액세스 권한이 있는 사용자'를 '모든 사용자'로 바꾸고 다시 배포하세요."
    echo "   (이렇게 고치면 URL은 그대로 유지됩니다)"
  else
    echo "❌ 예상과 다른 응답입니다:"
    printf '%s' "$BODY" | head -c 300; echo
  fi
  exit 2
fi

echo "== POST 확인 (테스트 행 1건이 시트에 들어갑니다) =="
# Apps Script는 POST를 받고 302로 결과 페이지를 가리킵니다. curl -L은 302에서 POST를 GET으로
# 바꿔버려 엉뚱한 오류처럼 보이므로, 리다이렉트를 따라가지 않고 302 자체를 성공으로 판정합니다.
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$U" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"version":"check","lang":"ko","src":"check_sh","clientRespId":"check-0001","answers":{"m1_name":"연결 테스트 행 - 삭제해도 됩니다"},"files":[]}')
case "$CODE" in
  200|302) echo "✅ POST 정상 (HTTP $CODE) — 시트에 테스트 행이 들어갔습니다";;
  *)       echo "❌ POST 실패 (HTTP $CODE)"; exit 3;;
esac
