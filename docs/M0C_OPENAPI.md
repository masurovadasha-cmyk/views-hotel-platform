# M0c.1 — «Мои поездки» через OpenAPI

Источник: contracts/guest-trips.openapi.json (Core bearer API). Генерация:
`node scripts/generate-guest-trips.mjs`; проверка актуальности: та же команда с `--check`.
Результат src/api/guest-trips.generated.ts коммитится. Существующий экран GuestTrips
получает список/карточку через wrapper guest-trips.ts и generated client.
Transport guestEmailRequest сохраняет cookie BFF, no-store, запрет redirects,
таймаут и ошибки сессии; bearer не переносится в браузер. Денежные суммы — строки.

Проверки: `npm test`, `npm run build`, `npm --prefix apps/api run build`,
`node scripts/cloud-core-tests.cjs` (Docker, только disposable PostgreSQL).
Frontend test проверяет drift, transport, ошибки и точность суммы выше Number.MAX_SAFE_INTEGER.
PostgreSQL integration проверяет реальные list/detail responses по схеме, включая отсутствие лишних полей.

Вручную: в разрешённом локальном guest pilot открыть «Мои поездки», следующую
страницу и карточку; отключить сеть, затем выйти из сессии и повторить загрузку.
Новая browser-проверка в этом срезе не выполнена. Публичного деплоя нет.
Генератор ограничен GET с одним path/query параметром и текущими типами схем;
для расширения OpenAPI потребуется отдельный срез и выбор полноценного генератора.
Далее M0d: одна команда dev:local и проверка каркасов приложений без переноса работающего UI.
