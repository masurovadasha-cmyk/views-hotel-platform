# Локальный экран SMS и тестовой оплаты

После `npm run build` и `npm --prefix apps/api run build`:
`node scripts/cloud-core-tests.cjs --dev-local --demo-sms`.
Откройте напечатанный webPort: http://127.0.0.1:PORT/?entry=sms-demo.
Это адрес внутри облачной машины, не публичная ссылка для телефона.

Сценарий: синтетический телефон → код из локальной консоли → свои поездки →
тестовая оплата → подтверждение. Бронь должна быть заранее создана и явно
привязана к этому SMS-аккаунту; поиск, получение quote и создание hold в этот
экран ещё не включены. Новый пользователь увидит пустой список.

Токен только в памяти React, без localStorage/sessionStorage/cookies. Reload
потребует повторного входа. Платёж идемпотентен по reservationId; при потере
ответа повторяется оплата той же брони. Двойное нажатие блокируется сразу.
Прокси доступен только local/test/demo, same-origin, с custom header и allowlist;
actor/staff заголовки не передаются. Public review/android исключают вход в экран.

Критерии/проверки: точные bigint суммы UZS/USD/EUR, нет токена в storage,
offline не отправляет оплату, lost reply повторяет ту же бронь, confirmation
обновляет поездки; gateway отклоняет чужой Origin и неподдерживаемые маршруты.
`node --test scripts/guest-sms-gateway.acceptance.cjs`
`node scripts/sms-payment-screen.browser.cjs`
`node scripts/cloud-core-tests.cjs --dev-local --smoke --demo-sms`

Браузерный тест использует mock Core и настоящий proxy; отдельно HTTP smoke
проверяет реальный Core/БД. Это НЕ единый сквозной UI→PostgreSQL тест. Скриншот390px
просмотрен. UI пока RU; Next shell, UZ/EN, полный поиск/бронь и late refund ещё нужны.
Миграции/платёжная логика не менялись. APK подпись и public web не обновлялись.
