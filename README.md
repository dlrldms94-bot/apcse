# APCSE 사전등록

HTML/CSS/JS + Express + PostgreSQL + PayPal

## Render 배포 (원클릭)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dlrldms94-bot/apcse)

또는 아래 링크를 클릭:

https://render.com/deploy?repo=https://github.com/dlrldms94-bot/apcse

배포 후 Render Dashboard에서 `ADMIN_PASSWORD`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` 을 설정하세요.

## 페이지

| URL | 설명 |
|-----|------|
| `/index.html` | 내국인/외국인 선택 |
| `/register-domestic.html` | 내국인 사전등록 |
| `/register-foreigner.html` | 외국인 사전등록 |
| `/payment.html` | PayPal 결제 |
| `/mypage.html` | 마이페이지 |
| `/admin-logs.html` | 관리자 로그 |
| `/preview.html` | 컨펌용 페이지 목록 |

## 로컬 실행

```bash
cp .env.example .env
# DATABASE_URL 설정 후
npm install
npm start
```

자세한 내용은 [DEPLOY_RENDER.md](./DEPLOY_RENDER.md) 참고.
