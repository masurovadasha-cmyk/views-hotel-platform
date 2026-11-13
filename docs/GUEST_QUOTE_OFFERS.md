# Персональный расчёт для SMS-гостя
Срез2026-11-13, основа0267381/PR98. Предпосылка гостевого hold, не сам hold.

Критерии: только сотрудник с актуальной сессией/scope назначает существующий
расчёт явно связанному профилю; только этот SMS-аккаунт читает его; expiry/unlink/
logout закрывают доступ; повтор не меняет получателя/срок и не дублирует аудит;
суммы сохраняют точность bigint, внутренние pricing/guest snapshots не выдаются.

В локальной песочнице включить VIEWS_GUEST_QUOTES_PILOT_ENABLED=true.
POST /v1/quotes/:id/guest-offer: x-views-staff-session и body {guestProfileId}.
GET /v1/guest-identity/sms/quotes/:id: Bearer SMS token, без query-параметров.
OpenAPI: contracts/guest-quotes.openapi.json. По умолчанию выключено, production
запрещён. --demo-sms включает флаг только в существующем disposable runner.

Проверки: node scripts/cloud-core-tests.cjs src/guest-identity;
node scripts/migration-upgrade-proof.cjs;
node scripts/cloud-core-tests.cjs --dev-local --smoke --demo-sms.
Перед smoke собрать root web и apps/api существующими npm run build.

Ручная проверка: авторизованный сотрудник выдаёт расчёт профилю; владелец видит
ценовые строки; другой SMS-аккаунт/непривязанный профиль не получают доступ.
Просмотр ничего не удерживает и не подтверждает; availability проверяется заново
при будущем hold. Пока нет UI, автоматической гостевой цены, нового generated
client, публичного размещения и платежей. Старые финансовые пути не менялись.
