# 관심 종목 뉴스 → Telegram (1분 간격)

기존 Termux 봇을 대체할 **Cloudflare Workers + D1** 기반 뉴스 전송 프로젝트입니다.
GitHub는 **코드/버전관리 및 자동 배포**를 담당하고, 실제 매분 실행은 Cloudflare가 담당합니다.
업로드된 Termux `newsbot.py`에서 기본 22개 종목·별칭과 뉴스 제외 필터를 이식했습니다. 휴대폰의 실제 운영 목록은 state.json에 별도 저장되므로 이 기본 목록과 다를 수 있습니다. Telegram 명령(/add, /remove, /pause 등), 여러 구독자, 리포트 일정 기능은 아직 이식하지 않았습니다. 현재 Worker는 지정한 한 대상에 뉴스를 발송합니다.

## 기능
- 기존 Naver API Hub 뉴스 검색의 최신순(sort=date)으로 22개 기본 종목·26개 별칭 조회
- 제목의 회사명 일치 확인, 광고·단순 주가·크래프톤 대회 기사 필터 유지
- Cloudflare Cron Trigger로 매 1분 검색 (실행이 지연될 수 있음)
- 기사 원문 URL 정규화 및 D1 중복 차단
- 새로 등록한 종목의 첫 실행은 기준선만 쌓고 과거 기사 전송 안 함
- 이후 기사 발행시간이 최근 24시간 이내인 결과를 최대 10건씩 묶어 Telegram 전송
- 수집·발송 실패 로그, 전송 재시도, 최근 7일 중복 기록 유지

**한계:** 뉴스 원문 발행·네이버 검색 색인·Cloudflare 예약 실행이 각각 지연될 수 있으므로 '기사 게시 즉시' 전송은 보장하지 않습니다. 회사명이 제목에 있어야 하며, 동명이인을 가리키면 잡음이 발생할 수 있습니다. Telegram이 수신한 직후 D1 기록 저장에 실패하면 드물게 중복 알림이 발생할 수 있습니다. 네이버 API 응답의 최신 100건 중 빠진 기사는 감지하지 못할 수도 있습니다.

## 1. Cloudflare 계정/Workers 준비
1. https://dash.cloudflare.com 에서 무료 계정을 생성합니다.
2. Workers & Pages / D1에서 **telegram-stock-news-db** 이름으로 D1 데이터베이스를 생성합니다.
3. D1 Database ID를 복사하여 `wrangler.jsonc`의 `REPLACE_WITH_YOUR_D1_DATABASE_ID`를 교체합니다.
4. GitHub 저장소 → Settings → Secrets and variables → Actions 에서
   - `CLOUDFLARE_API_TOKEN`: Workers 및 D1 배포 권한이 있는 Cloudflare API 토큰
   - `CLOUDFLARE_ACCOUNT_ID`: Cloudflare 계정 ID
   등록합니다.
5. GitHub Actions > Deploy Cloudflare news alert > Run workflow 로 실행합니다. 이후 main에 코드 수정 사항을 푸시할 때 자동 배포됩니다.

## 2. 네이버 뉴스 검색 API
기존 Termux에서 사용하는 Naver API Hub 인증정보를 재사용합니다. 엔드포인트는 `naverapihub.apigw.ntruss.com/search/v1/news`이며 API Gateway 헤더를 사용합니다. 일반 네이버 개발자센터용 인증정보와 혼동하지 마세요.

22개 종목의 별칭까지 검색하면 매분 26회, 하루 **37,440회** 호출합니다. 기존 5분 간격보다 호출량이 약 5배이므로 실제 API Hub 무료 할당량·과금 설정을 확인해야 합니다. 무료 한도 충족은 아직 확인되지 않았습니다.

## 3. Telegram 설정
- Termux에서 사용 중인 텔레그램 봇을 그대로 사용하려면 Bot Token과 대상 chat_id가 필요합니다.
- 봇을 그룹에 넣는 경우, 발송 권한이 있는지 확인합니다.
- **토큰과 API 비밀키를 GitHub 코드/이슈/채팅에 붙여넣지 마세요.** Cloudflare Secrets에 직접 넣습니다.

## 4. Workers 비밀 설정
Cloudflare 대시보드의 Workers > `telegram-stock-news-alert` > Settings > Variables and Secrets에서 다음 4개를 각각 **Secret**으로 설정합니다.
- `NAVER_CLIENT_ID`
- `NAVER_CLIENT_SECRET`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

GitHub Actions로 최초 Worker 배포를 완료한 다음 Cloudflare 대시보드에서 위 4개를 입력합니다.
Workers Secret을 GitHub Actions로 관리하도록 바꾸지 않는 한, 해당 값을 깃허브 비밀변수에 중복 입력할 필요는 없습니다.

## 5. 확인과 운영
- GitHub Actions의 배포 단계가 성공했는지 확인합니다.
- Cloudflare Workers 대시보드에서 Cron Trigger `* * * * *` 등록을 확인합니다.
- Cloudflare Workers Logs에서 `Checked 22/22 tickers` 등을 확인합니다.
- 첫 실행: 기존 기사 알림 없이 초기화. **그 후 신규 검색 결과부터** 알림 발송.
- 대상 종목을 변경하려면 `src/watchlist.js`를 수정합니다.
- `GET /health`는 비밀값을 공개하지 않는 단순 상태 페이지입니다. 실시간 점검 결과는 아닙니다.

## 예상 비용
Workers / D1 무료 한도를 목표로 합니다. 현재 설정의 API Hub 일 37,440회 호출이 무료인지와 D1 사용량이 무료 범위인지 배포 전에 확인해야 합니다. 서비스 약관, 요금제, 한도가 바뀌거나 조회량이 증가하면 재확인해야 합니다. 무료 플랜은 한도 초과 시 사용이 제한될 수 있습니다.

## 보안 주의
이 저장소는 현재 **public**입니다. 토큰/비밀번호는 소스 코드, .env, 커밋 기록에 절대 올리지 마세요. 이미 유출된 토큰이 있다면 즉시 재발급해야 합니다.
