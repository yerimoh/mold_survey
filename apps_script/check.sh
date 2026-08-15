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
curl -sL -X POST "$U" -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"version":"check","lang":"ko","src":"check_sh","clientRespId":"check-0001","answers":{"m1_name":"연결 테스트 행 - 삭제해도 됩니다"},"files":[]}'
echo
