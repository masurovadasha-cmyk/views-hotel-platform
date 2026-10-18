# Срез40 — закрытие претензии из общей карточки

Дата: 2026-10-19, Asia/Tashkent. Основа: `1ee1c6d`; прежние resolve_claim и SQL0124. Новых таблиц, прав, зависимостей и финансовых операций нет.

## Критерии до кода

1. Open/answered показывают checkbox с пояснением и явное закрытие; resolved и отсутствие претензии скрывают действие. Лимит сообщений не блокирует закрытие, после checkout доступ владельца сохраняется.
2. Без согласия, offline или при pending POST не отправляется. Смена revision сбрасывает согласие.
3. Квитанция проверяет ID/revision, неизменные стадию/сумму/валюту, бирку/тип претензии, увеличение истории на1 и последний resolve_claim. Повтор после потери/неверного ответа использует прежний ключ/тело.
4. Реальный PostgreSQL: одно закрытие/audit/outbox, заказ и фолио неизменны; получение после закрытия требует отдельного согласия. Конфликт даёт409 без автоповтора.
5. Logout/смена владельца во время ожидания блокировки отклоняют свежую и повторную команды без изменений. RU/UZ/EN, Light/Dark,390px проверены.

## Границы

Только disposable PostgreSQL/loopback SMTP. Публичный веб/APK не обновляются; фото/компенсация и восстановление pending после hard reload вне среза.

## Проверки

- `npm test -- src/features/laundry/guest-laundry-resolve.test.ts`: RED exit1 (helper отсутствовал,0собранных тестов), GREEN exit0/42PASS.
- `node scripts/cloud-core-tests.cjs src/service-orders/laundry-replay.integration.test.ts`: exit0/37PASS,9новых resolve-проверок fresh/cached logout/unlink/reassign при command lock и logout при profile lock, плюс replay после checkout. Views_app без super/BYPASSRLS, реальные pg_locks/blocking PID. Отдельные stay/intake ожидания и отзыв staff scope новым набором не проверялись.
- `npm test`: exit0,905тестов/89файлов. `npm run typecheck` и `npm run build`: exit0. В apps/api `npm run typecheck && npm run build`: exit0. Прежнее предупреждение Vite о размере chunk остаётся.
- `node scripts/core-network-primitive-gate.mjs`:187файлов/0findings; `node --test scripts/staff-mail.acceptance.cjs`:15PASS. ReadMigrations:124checksum PASS, миграции не изменялись.
- На старом dist `VIEWS_ORDER_LIST_BROWSER_ONLY=true VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/service-orders/laundry.integration.test.ts`: ожидаемый exit1 на отсутствующем действии закрытия;12Core и8предшествующих proofs PASS.
- `node scripts/cloud-core-tests.cjs src/supply src/service-orders src/staff-auth`: exit0,236Core/23файла PASS. Проверенный исходник: dirty `1ee1c6d1db26471af8138fb4498472a49b0ad506`.
- `VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/service-orders/laundry.integration.test.ts`: exit0,12подготовительных Core и22HTTP/browser proofs PASS. Новый proof использует помеченные синтетические заявки предыдущего claim-proof; обработка и ответы идут через действующий runtime. История8→9, lost/неверная валюта/same-key, отсутствие дублей, неизменные полные order/folio snapshots, отдельное согласие на получение,409/manualGET и закрытие после checkout проверены.
- Снимки RU/UZ/EN×Light/Dark×390px получены без overflow; RU Light/Dark иUZ Dark просмотрены, текст согласия и кнопка читаемы. Проверка исходника: guard при submit, pending вне формы, серверная авторизация после locks, неизменные финансовые команды.
- Логи: `/tmp/views-block40-unit-red.log`, `/tmp/views-block40-unit-green.log`, `/tmp/views-block40-auth.log`, `/tmp/views-block40-core.log`, `/tmp/views-block40-browser-final.log`.

## Запуск и ручная проверка

`npm run dev:local` — локальная синтетическая среда; не направлять фикстуры на постоянную views_local.

- Открыть open/answered претензию, прочитать пояснение; без checkbox закрытие недоступно.
- После закрытия проверить историю; получение белья требует отдельного checkbox, начисление прежнее.
- Проверить закрытие после checkout и при8сообщениях. После достижения лимита и закрытия показано обращение на ресепшен без предложения закрыть уже закрытую претензию.
- При неизвестном ответе повторить ту же операцию; при409 вручную обновить и заново дать согласие.
