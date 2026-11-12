# Локальный SMS для демо

Восстановлен 2026-11-12 на основе удалённого043f164. Это повторная реализация
неопубликованного6d8e619 по сохранённому описанию, не восстановление исходного Git-объекта.

Критерии: (1) disposable DB и явный флаг, (2) запрет неподходящего номера до записи,
(3) OTP только в локальной консоли, (4) одноразовость и отзыв сессии,
(5) обычный runtime без SMS-адаптера по умолчанию.

После `pnpm install --frozen-lockfile`, `npm run build` и
`npm --prefix apps/api run build`:

```sh
node scripts/cloud-core-tests.cjs --dev-local --demo-sms
```

Нужен локальный Docker с PostgreSQL16. Команда создаёт временную БД и запускает
API только на loopback; порт выводится в sandboxReady. Остановка Ctrl+C.
Никаких реальных SMS: используйте только синтетические номера +9980000000xx.
Это соглашение fixtures, а не официально зарезервированный диапазон.

`POST /v1/guest-identity/sms` принимает `{ "phone": "+998000000001", "locale": "ru" }`.
Ответ содержит challengeId, но не код. Код выводится в локальную консоль с маской номера.
`POST /v1/guest-identity/verify` принимает challengeId и code; полученный токен
передаётся как Bearer в GET session и POST logout того же префикса.
Не используйте настоящие телефоны, данные клиентов или внешние провайдеры.

Проверки:
```sh
node --test scripts/demo-sms.acceptance.cjs
node scripts/cloud-core-tests.cjs src/guest-identity/guest-identity.integration.test.ts
node scripts/cloud-core-tests.cjs --dev-local --smoke --demo-sms
node scripts/cloud-core-tests.cjs --dev-local --smoke
```

SMS identity пока не связана с email trips/services. Новый интерфейс гостя,
booking bridge, тестовая оплата и полный12-шаговый сценарий не реализованы этим срезом.
Другие неопубликованные изменения прошлого сеанса, включая0131 и тест6/3,
в этой ветке не восстановлены и не объявляются готовыми.
