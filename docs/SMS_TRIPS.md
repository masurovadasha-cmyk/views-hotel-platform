# SMS: чтение своих поездок

Срез2026-11-13, база02d8477 (PR97). Только чтение, local rehearsal.

Критерии: только явный владелец профиля; чужой ID/совпадение телефона не дают
доступа; logout и unlink отзывают доступ; пагинация20 без потерь на одинаковых
датах; закрытая проекция денег/данных; email поведение сохраняется.

Новые GET endpoints:
- `/v1/guest-identity/sms/trips?cursor=...`
- `/v1/guest-identity/sms/trips/:id`

Bearer — действующая SMS-сессия. Включаются существующими локальными флагами
SMS identity и VIEWS_GUEST_TRIPS_PILOT_ENABLED. Список и карточка соответствуют
общему contracts/guest-trips.openapi.json версии1.1.0. Сгенерированный клиент
принимает transport callback; его типы и относительные маршруты не изменились.

SQL0131_guest_sms_trips повторно разрешает сессию в том же SQL statement,
соединяет организацию профиля, брони и объекта и проверяет user_id владельца.
Совпадение телефона/email и принятые email-приглашения не создают SMS-доступ.
Никаких staff-заголовков, новых tenant-wide RLS правил или автоматической
привязки старых броней. Сумма остаётся строкой минимальных денежных единиц.

Проверка после сборки API и web:
```sh
node scripts/cloud-core-tests.cjs src/guest-identity
node scripts/migration-upgrade-proof.cjs
node scripts/cloud-core-tests.cjs --dev-local --smoke --demo-sms
node scripts/generate-guest-trips.mjs --check
```

Seed/DDL применяется runner только в disposable PostgreSQL; не запускать на
постоянной базе. Для ручной проверки используйте DEMO_SMS.md: новая SMS-сессия
получает пустой список, после logout —401. Положительные сценарии с синтетическими
принадлежащими гостю бронями и чужими бронями проверяются integration tests.

Ограничения: нет нового UI, создания брони, привязки гостем старой брони или
тестовой оплаты. Полный demo happy path не закрыт. Неопубликованная старая
миграция market answer0131 не восстановлена: при её восстановлении потребуется
новый номер после текущего журнала, без изменения применённых checksum.
