# Срез44 — претензия V Market из общей карточки

2026-10-19, основаdc7d8e0. Критерии до кода: handed_over/completed без open issue; описание3–1000; явная отправка; сверка ID/revision/суммы/валюты/текста; неизменный retry при неизвестном результате; RU/UZ/EN, темы иoffline; деньги/склад неизменны.

Используются существующие SQL0126, endpoint и pending/retry. GuestMarketReport добавляет форму; guest-market-issue хранит ожидаемую стадию/деньги вне wire-body, проверяет открытую претензию с точным текстом без старого ответа. Служебные права/налоги/зависимости не меняются, миграция не нужна. Checkout допустим по прежним правилам.

## Проверка и запуск
```sh
npm run build
npm test
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/service-orders/market.integration.test.ts src/service-orders/market-issue-replay.integration.test.ts src/staff-auth
node scripts/core-network-primitive-gate.mjs
node --test scripts/staff-mail.acceptance.cjs
```
Runner использует только помеченную disposable PostgreSQL16 и loopback SMTP. RED: отсутствовал helper/component,0tests, не воспроизведённая финансовая ошибка.

## Риски / ручная приёмка
Проверить форму после передачи и после получения, блокировку при open issue, повтор после ответа склада, три языка и темы. После конфликта обновить карточку; при неизвестном ответе повторить исходную команду. Обращение не означает возврат/корректировку фолио. Полная перезагрузка теряет in-memory pending; восстановление отдельно. Staff answer_issue требует отдельного аудита. Public032ea93/Cloudflare/APK и Canva56partial/84pending неизменны; production не проверен.

Проверен dirty-source поверхdc7d8e0: web983/91files,41новый контрактный/рендер-тест; финальный focused41PASS после уточнения fixture. Core66/6files, web/APIbuild/typecheck, network187без findings, mail15,126checksum PASS. Новый браузерный сценарий подтвердил одинаковые ключ/тело, одну претензию/audit/outbox и неизменные заказ/фолио/склад.6снимков RU/UZ/EN×Light/Dark×390; RU Light/Dark иUZ Dark просмотрены.

Полная HTTP/browser цепочка: exit0,24proofs PASS;66подготовительных Core tests.
