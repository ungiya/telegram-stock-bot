# 관심 종목 뉴스 → Telegram (1분 간격)

기존 Termux 봇을 대체할 **Cloudflare Workers + D1** 기반 뉴스 전송 프로젝트입니다.
GitHub는 **코드/버전관리 및 자동 배포**를 담당하고, 실제 매분 실행은 Cloudflare가 담당합니다.
현재 저장소에는 기존 Termux 코드가 없으므로, 기존 코드와의 동작 호환성은 확인되지 않았습니다.

## 기능
- Naver News Search API의 최신순(sort=date)으로 12개 관심 종목 조회
- Cloudflare Cron Trigger로 매 1분 검색 (실행이 지연될 수 있음)
- 기사 원문 URL 정규화 및 D1 중복 차단
- 새로 등록한 종목의 첫 실행은 기준선만 쌓고 과거 기사 전송 안 함
- 이후 기사 발행시간이 최근 3시간 이내인 결과를 최대 10건씩 묶어 Telegram 전송
- 수집·발송 실패 로그, 전송 재시도, 최근 7일 중복 기록 유지

**한계:** 뉴스 원문 발행·네이버 검색 색인·Cloudflare 예약 실행이 각각 지연될 수 있으므로 '기사 게시 즉시' 전송은 보장하지 않습니다. 검색어가 기사 내용에 간접 등장하거나 동명이인을 가리키면 잡음이 발생할 수 있습니다. Telegram이 수신한 직후 D1 기록 저장에 실패하면 드물게 중복 알림이 발생할 수 있습니다. 네이버 API 응답의 최신 10건 중 빠진 기사는 감지하지 못할 수도 있습니다.

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
1. https://developers.naver.com/apps/#/register 에서 애플리케이션을 등록하고 검색 API를 활성화합니다.
2. `Client ID`, `Client Secret`을 발급받습니다.
3. 검색 API의 일별 호출 한도 및 사용약관을 확인합니다. 12개 * 하루 1,440회 = **17,280회/일**, 한도가 25,000회라면 7,720회 여유가 있습니다. 토픽을 17개 이상으로 늘리면 기본 호출 한도를 넘을 수 있습니다.

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
- Cloudflare Workers Logs에서 `Checked 12/12 tickers` 등을 확인합니다.
- 첫 실행: 기존 기사 알림 없이 초기화. **그 후 신규 검색 결과부터** 알림 발송.
- 대상 종목을 변경하려면 `src/watchlist.js`를 수정합니다.
- `GET /health`는 비밀값을 공개하지 않는 단순 상태 페이지입니다. 실시간 점검 결과는 아닙니다.

## 예상 비용
Workers / D1 무료 한도 및 Naver 뉴스 검색 API 무료 할당량 내에서 운영하도록 설계했습니다. 서비스 약관, 요금제, 한도가 바뀌거나 조회량이 증가하면 재확인해야 합니다. 무료 플랜은 한도 초과 시 사용이 제한될 수 있습니다.

## 보안 주의
이 저장소는 현재 **public**입니다. 토큰/비밀번호는 소스 코드, .env, 커밋 기록에 절대 올리지 마세요. 이미 유출된 토큰이 있다면 즉시 재발급해야 합니다.
