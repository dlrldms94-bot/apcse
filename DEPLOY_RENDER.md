# Render 배포 가이드

## 1) GitHub push 후 Blueprint 배포

1. GitHub 저장소: `https://github.com/dlrldms94-bot/apcse`
2. Render 대시보드 → **New** → **Blueprint**
3. 저장소 `apcse` 선택 → **Deploy Blueprint**
4. `render.yaml` 기준으로 Web Service + PostgreSQL 자동 생성

## 2) 배포 후 환경변수 설정

Render Web Service → **Environment** 에서 아래 값을 직접 입력:

| 변수 | 설명 |
|------|------|
| `ADMIN_PASSWORD` | 관리자 로그 페이지 비밀번호 |
| `SESSION_SECRET` | 마이페이지 세션용 랜덤 문자열 |
| `PAYPAL_CLIENT_ID` | PayPal Sandbox Client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal Sandbox Secret |

`DATABASE_URL` 은 PostgreSQL 연결로 자동 설정됩니다.  
`APP_URL` 은 Render의 `RENDER_EXTERNAL_URL` 을 자동 사용합니다.

## 3) 배포 확인

- Health: `https://<render-url>/api/health`
- 메인: `https://<render-url>/index.html`
- 컨펌용: `https://<render-url>/preview.html`
- 관리자 로그: `https://<render-url>/admin-logs.html`

## 4) 주의사항

- Render Free 플랜은 15분 미사용 시 슬립 모드 (첫 접속 느릴 수 있음)
- PayPal 결제 테스트는 Sandbox 키 설정 후 가능
- 운영(Live) 전환 시 `PAYPAL_MODE=live` 로 변경
