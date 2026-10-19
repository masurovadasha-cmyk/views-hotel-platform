# Срез43 — авторизация претензии V Market

Основа5236520,2026-10-19. Перед формой общей карточки обнаружен ранний cached replay и отсутствие повторной проверки сессии после ожидания guest_profile в0084.

Критерии до кода:
1. Fresh/cached report_issue после logout/unlink/reassign во время ожидания ключа запрещены; заказ, склад, фолио и события не меняются.
2. Logout при ожидании проживания или профиля запрещает команду и cached ответ.
3. Доступный гость после checkout может открыть претензию; повтор сохраняет исходный результат без второго события, изменённое тело конфликтует.
4. Новая функция закрыта от runtime; прежний app-wrapper и все остальные действия сохраняются.

Допущение: изолировать гостевой report_issue отдельной добавочной миграцией; UI в следующем срезе. answer_issue персонала и другие действия требуют отдельного аудита. Претензия не является возвратом денег и не меняет склад. Глобальная атомарность logout после последней проверки не заявляется.

## Запуск
```sh
node scripts/cloud-core-tests.cjs src/service-orders src/supply src/staff-auth
npm run build
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
npm test
VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/service-orders/market.integration.test.ts src/service-orders/market-issue-replay.integration.test.ts
node scripts/core-network-primitive-gate.mjs
node --test scripts/staff-mail.acceptance.cjs
```
Только помеченная disposable PostgreSQL16, runtime views_app без superuser/BYPASSRLS, loopback SMTP. Из db/migrations: `sha256sum --check ../migrations.sha256`. Прежние125 миграций не изменены.

RED после исправления тестового lock:7failed/5passed, включая отсутствие новой private-функции и6сценариев гонок. Прямой FOR UPDATE market_orders недоступен runtime и исключён из harness без выдачи дополнительных прав. GREEN12целевых сценариев.

## Что проверить вручную / ограничения
- Претензия после передачи/получения, ответ склада и повтор после checkout сохраняют прежние правила.
- Открытая претензия не начисляет/возвращает деньги и блокирует получение до ответа; закрытый фолио не должен препятствовать самому обращению.
- Перед выпуском проверить миграцию на копии эксплуатационной схемы; production не проверен.
- Новая форма общей карточки, аудит staff answer_issue и восстановление pending после reload ещё не реализованы этим срезом. Public032ea93, Cloudflare/APK и Canva56partial/84pending неизменны.

Проверен dirty-source поверх52365209ed97b1839e0005b7bf7c6b78b506e137: Core265/25files, web942/90files, web/APIbuild/typecheck, network187без findings, mail15,126checksum PASS (exit0).

Полная HTTP/browser цепочка: exit0,36подготовительных Core tests и23proofs PASS; новый UI не добавлялся.
