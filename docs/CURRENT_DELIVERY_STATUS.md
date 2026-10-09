# VIEWS — current delivery status, 9 October 2026 (Tashkent)

0.11.0-preview: V Market добавлен в общий веб/Android-клиент: демонстрационный
каталог, категории, поиск, список покупок, количество и проверка без отправки.
В CRM сохранён API-код minimart, отображаемое название — V Market. В кабинетах
закупок/склада явно указано, что розничные цены, заказы и резервы ещё не связаны
с реальным складским учётом. Нет новых зависимостей, миграций и платных ресурсов.
Подробности, проверки и ручная приёмка: RELEASE_0_11_V_MARKET.md. Сведения ниже
относятся к предыдущему релизу0.10.1; актуальный опубликованный SHA/checksum
проверяется по release.json и GitHub release notes.

Дополнительно0.10.1 прошёл307frontend и476Core тестов, полный изолированный
браузер/BFF/PostgreSQL/SMTP-прогон. Дубль offline-сообщения устранён; локальные
Core-кабинеты сохраняют собственные уведомления и блокировку действий без сети.

Адаптация по Canva: Guest App9, Staff CRM17 и Design System6 — изучены32страницы.
Гость: тёплый интерфейс, фильтры, совпадающая с ними демонстрационная карта,
5этапов бронирования и явно неотправленный предпросмотр заявки. CRM: indigo,
поиск/категория/приоритет/сортировка, допустимые действия и доступные карточки.
Общая тема сохраняется, отсутствие сети обозначено; RU/UZ/EN сохранены.

Проверки рабочего дерева относительно64a9731: frontend307/56, typecheck и build;
Canva browser214layout +54guestcontrast samples, минимум5.15:1; прежние guest и
legacy staff HTTP-fixture сценарии, портал и9ролевых входов проходят. Это не
проверка живых провайдеров или полное WCAG-заключение. После этих прогонов
усилен контраст подписей календаря; окончательный review-прогон проверит его
отдельно. CI теперь запускает новую browser proof после сборки.

Готовится0.10.1-preview/1000002 для прежних Pages/Cloudflare preview и Android.
Фактический опубликованный SHA/checksum сверяются по release.json и GitHub
Release notes после публикации. Публичный Core/email/платежи не подключены.
Новые миграции в этом блоке не нужны; постоянная БД и прежняя подпись сохранены.
60-страничный VIEWS DesignPack не скачан из-за32MiB лимита; Vertex50также не
скачан и остаётся отдельным проектом. Полной интеграции этих файлов нет.
См. [матрицу32страниц](CANVA_SCREEN_PARITY.md),
[границы реализации и ручную приёмку](CANVA_2026_10_09_INTEGRATION.md),
[выпуск0.10](RELEASE_0_10_PREVIEW.md).

## Предыдущий блок: приёмка и инвентаризация, 0.9

Текущий программный блок: [частичная приёмка и инвентаризация](stages-b/04-partial-receipts-stocktake.md).
0066 добавляет несколько поставок на заказ и остатки недопоставленного объёма;
0067 — физический пересчёт с причиной, предварительным расчётом и отдельным
подтверждением. Остаток и версия проверяются под блокировкой; устаревший расчёт
не проводится. Повтор исходной команды не дублирует движения. RU/UZ/EN.
Новые миграции применены только к одноразовой БД; views_local сохранена.

Проверено на изменённом дереве относительноb4a5c12: Core476/83, root299/53,
API/web typecheck/build, network172, mail15. Настоящий браузер/BFF/Core/PG
сценарий склада прошёл6групп, включая приёмку4+6, отказ превышения, пересчёт
после промежуточной выдачи, потерю ответа и совместимость полного прихода.
Предыдущие фолио/ролевые входы/гостевые сценарии и SMTP прошли. Исправлена
тестовая дата проекции заездов после полуночи по часовому поясу объекта;
production-контроллер не менялся.

Владелец разрешил обновить веб и APK. [Релиз0.9.0](RELEASE_0_9_PREVIEW.md)
сохраняетuz.views.preview, повышает Android versionCode до900001 и использует
прежний сертификат. Публичные сборки остаются явно обозначенным static-demo:
адрес публичного Core и реальная почта в этой среде не настроены. Это не
активация настоящего входа, платежей или складской базы в интернете.

Публикация имеет отдельные доказательства: clean source SHA в release.json
на [Pages](https://masurovadasha-cmyk.github.io/views-hotel-platform/) и
[Cloudflare](https://staging-master-reference-v1-views-hotel-platform.masurovadasha.workers.dev/),
подписанный APK/checksum и финальные результаты в
[примечаниях релиза](https://github.com/masurovadasha-cmyk/views-hotel-platform/releases/tag/v0.9.0-preview).
Наличие этого документа само по себе не доказывает успешное развёртывание.
Промежуточная публикацияb4a5c12 на обеих веб-ссылках подтверждена metadata и
отрисовкой скачанных с проверкой TLS файлов; все9входов и5направлений проверены.

Не завершены возвраты/перемещения, поставщики/договоры, денежная оценка,
массовая ведомость пересчёта и отдельное утверждение инвентаризации.
Финансовое закрытие фолио и остальные Б3–Б11 сохраняются в
[плане](stages-b/NEXT_PROGRAMMING_BLOCKS.md). Исторические записи ниже — по своим датам.

Публичный Cloudflare Preview теперь доступен без Access-входа:
https://staging-master-reference-v1-views-hotel-platform.masurovadasha.workers.dev/ .
После изменения настроек владельцем проверены HTTP200, версия0.8.0-preview,
SHAcd4cc76, четыре направления и открытие гостевого экрана без ошибок JavaScript.
Публичный Core/email по-прежнему не подключён.

Обновление публичного интерфейса: [0.8.0-preview](RELEASE_0_8_PREVIEW.md).
Владелец явно запросил публикацию веба и APK. Подготовлены общая стартовая
страница для четырёх направлений, сборки GitHub Pages/Cloudflare Workers и
отдельная Android-идентичность `uz.views.preview`. Проверки: root249/42,
Core404/73, network147, mail15; проверены браузерные переходы и 10 ограничений
подписи. Реальная доставка email и публичный PostgreSQL Core не подключены;
это явно показано в интерфейсе. Статус фактической публикации и SHA проверяются
по `release.json` и prerelease GitHub, а не по старым отчётам ниже.
Веб и подписанный APK 0.8.0-preview опубликованы и повторно скачаны/проверены
на исходном коммите72bc4b1. Ссылки и доказательства — в документе релиза.
Cloudflare Preview на коммитеcd4cc76 успешно собран и развёрнут после добавления
`[previews]`: подключение использует `wrangler preview`. Владелец включил
Preview URLs и снял Access-защиту; открытая ссылка проверена выше.
Отдельный deploy Actions по-прежнему пропущен из-за отсутствия credentials;
успешно именно подключение Workers Builds. Веб GitHub Pages отдаётcd4cc76.
Физический Android-телефон ещё не проверен. Нижеследующие исторические записи
об отсутствии публичного APK относятся к предыдущим этапам.

Актуальное продолжение этапов Б: Б1 — схема/реестры проверены; Б2 — локальные
тарифы, поиск, холды, отмена и SMS-идентичность реализованы, внешняя доставка и
гостевой UI ещё требуют подключения/приёмки. В Б3 исправлены повторы и целостность
проводок; добавлены API/веб сверки возвратов, журнал проверок и защита поздних callback.
Click/Uzum, банковский депозит и реальные выплаты ещё не реализованы.
Б4–Б11 остаются в полном плане. Это не завершение всего продукта.

Документы: [Б1](stages-b/01-database.md), [Б2](stages-b/02-backend.md),
[SMS](stages-b/02-guest-sms-identity.md), [Б3](stages-b/03-payments-and-finance.md).
Последний подблок: [сверка возвратов](stages-b/03-refund-reconciliation.md).
Проверки: Core404/73 + SQL-проверки, root246/40; typecheck/build, network147,
mail15, браузер5 групп (синтетические HTTP fixtures). Локально57 миграций,
auth13/32HTTP и restore88 таблиц/private9, документы25/turnovers17 прошли
на изменённом дереве относительно60c03eb. Реальные SMS/платежи и публичный
выпуск не выполнялись.

This is the current implementation/release snapshot. PRODUCT_REQUIREMENTS.md
is the complete owner-supplied MVP/V2/V3 scope, including previously omitted
Telegram, marketplace, search, service and application requirements. It supersedes old WIP
labels in the historical handoff, but does not turn local proofs into production
acceptance. Source repository and branch remain unchanged; main is not merged.

| Block | What works / exists | What is still not complete |
| --- | --- | --- |
| Core environment | PostgreSQL 16, restricted runtime, immutable migration ledger, repeatable cloud startup; dedicated local server opens connected staff workspace by default | Persistent public host, named HTTPS endpoint, HA/failover |
| Staff identity | Invitation/password login, sessions/CSRF, scoped staff, password reset/change, local email verification, passkeys/recovery | Real mail delivery, approved public HTTPS and privileged production MFA |
| Booking | PostgreSQL quote/hold/release; synthetic confirmed stay transitions with inventory, audit/outbox and retries | Real inventory/tariff onboarding and paid-stay operational integration |
| Guests | Versioned synthetic primary guest entry/replacement; related-document edits blocked; guest preview RU/UZ/EN, working navigation/favorites/help and corrected legacy booking details | Real PII onboarding, policy-approved data collection and retention |
| Documents | Encrypted fixed synthetic text, scoped noncached preview, expiring session-bound review receipt, accept/reject, audit and replay checks | Selected regional vault adapter, arbitrary real uploads, content inspection, KMS/rotation, approved human review rules |
| Stay and turnover | Synthetic check-in/out; checkout creates pending turnover; dedicated front-desk queue with search/sort/partial-result warning and keyboard confirmation; next check-in blocked until explicit readiness confirmation; separate gated housekeeper self-claim/release/complete with actual password/Core/browser proof in a disposable DB | Actual staff onboarding, reassignment policy and real-room operational acceptance |
| Payments/fiscalization | Provider-bound transport/audit and Payme sandbox/Core tests from preceding stages | Provider credentials/certification, real transactions and fiscal operator integration |
| Government registration | Existing contracts/policy/test provider | Approved real registration adapter/account and current operational/legal rules |
| Recovery | Disposable mail/auth restore; full local snapshot restored and table digests matched, encrypted files decrypted with separate key | Production recovery, KMS recovery and restored deployment credentials/runbook exercise |
| Tenant/owner onboarding | Default-off owner/manager creation and aggregate editing: up to 20 categories/100 rooms, occupancy, independent rates/cancellation, conflict detection, atomic audit/outbox and retries; isolated Core/UI proofs | Verified business data, privileged login/MFA proof, operational inventory editing and sales activation |
| Calendar blocks | Default-off owner/manager calendar for active platform inventory in UZ: atomic manual block/unblock, unified EXCLUDE, replay, scoped reads and RU/UZ/EN UI; actual Core race against a payment hold passed | Privileged user rollout, pagination, drag-and-drop PMS, room moves, calendar pricing UI and channel synchronization |
| RU/UZ/EN, accessibility | Connected staff/owner/housekeeper (375 entries), guest/public entry (223) and legacy CRM (547) in RU/UZ/EN; separate preferences, keyboard dialogs, mobile role navigation and three languages at four widths | Native-speaker review, full screen-reader/product accessibility acceptance |
| Android | Shared-web WebView wrapper; unsigned native package verified at Stage 7.49–7.50, with manifest/alignment and 9 assets checked. Later owner editing/calendar changes are web-source increments, not a newly packaged APK | Android 10/15 install attempted; WebView syntax fixed and crash recovery added, native UI acceptance remains blocked in software emulation. Existing-key signing helper passes 10 disposable checks; permanent key, update, physical-device and connected HTTPS proof remain |
| Deployment/CI | Git branch push and local builds/tests | Public GitHub checks read at 6ce5fcc: verify and both mail jobs succeeded; Workers Builds failed. Cloudflare build log access and successful deployment remain unverified |
| Wider product scope | Core foundations and legacy/demo presentation exist | Connected guest search/maps/trip, Telegram bot/mini app, host verification, full messaging/services/reviews/loyalty/payouts; Next.js guest/host and Flutter/React Native apps; see PRODUCT_REQUIREMENTS.md |
| Production release | No activation performed | Explicit owner approval plus preceding operational/provider/legal/device acceptance |

## Latest execution order and confirmed scale

The owner now requires stages B0–B11 **one at a time**. B0 planning/ADRs are in
[stages-b/00-plan-and-assumptions.md](stages-b/00-plan-and-assumptions.md).
Confirmed target: 500 apartments across Tashkent, Samarkand, Bukhara and Khiva;
current work is owner + Codex, future developer/QA/manager/accountant. No legal
entity or integration partners yet. The six-month own-inventory launch plan is
conditional; the full marketplace/integration scope remains open. Calendar rate
work started before this instruction is uncommitted, typechecked-only WIP and
must not be counted as a completed block. Next stage is B1 schema analysis.

## Current active local chain

Staff login → reception → synthetic guest → encrypted synthetic file preview →
explicit review decision → synthetic check-in → checkout → pending turnover →
explicit readiness confirmation. Each write is scoped and audited; inventory,
command and outbox effects are transactional. The proof also exercises refusal,
replay, rollback and reload/restart behavior. A positive synthetic review is not
identity certification, and a turnover confirmation is not proof of physical work.

## Next implementation dependencies

1. Real guest/document/registration work needs a selected storage/provider
   contract, regional/key/retention decisions and securely configured access.
   Existing runtime has no registered real document vault or registration adapter.
2. Paid-stay activation needs provider-approved sandbox onboarding and acceptance;
   no test payment is to be relabeled as a real settlement.
3. Real owner/inventory onboarding requires owner-provided verified business data.
4. Legacy staff/demo localization is implemented. The synthetic housekeeper
   journey now has an actual password/Core/browser proof in a disposable DB.
   Multi-category draft editing is implemented and verified without hosting. Owner
   privileged login, real role onboarding and operational inventory editing remain open; native-speaker acceptance is not claimed.
5. Android wrapper/build and existing-key signing tooling are present. The owner
   confirmed no permanent signing key, host or domain yet (7 October 2026). Real
   device/update acceptance and secure key configuration remain required.
6. Public hosting, external email, real payments, recurring services, main merge
   and production remain explicit activation gates from AGENTS.md.

Do not request secret values in chat. Reuse existing secure environment bindings
where applicable and request only missing provider-specific requirements after
checking them. Available Git transport authentication is already sufficient for
this branch; no replacement GitHub token is requested.

See STAGE7_OWNER_CALENDAR.md for the latest checks.
STAGE7_INVENTORY_EDITING.md records draft inventory editing.
STAGE7_LEGACY_CRM_AND_CONNECTED_HOUSEKEEPING.md records the preceding increment.
STAGE7_OWNER_AND_HOUSEKEEPING.md records the initial gated role implementations.
STAGE7_GUEST_LOCALIZATION.md records guest/public-entry localization.
STAGE7_STAFF_LOCALIZATION.md records connected staff translations.
STAGE7_TURNOVER_WORKSPACE.md records the front-desk turnover queue.
STAGE7_ANDROID_SIGNING_AND_DELIVERY.md records signing configuration and native
emulator failure boundaries.

### Этапы Б — Б1 (8 октября 2026)

Совместимое расширение БД проверено: фолио, услуги, промокоды, лояльность, черновики выплат, споры и отзывы; 0050–0053, RLS, индексы и синтетические сиды. Core 327 тестов и 7 SQL-групп, веб 243 теста, сборки успешны. Подробности и ограничения: [Б1](stages-b/01-database.md). Это готовность схемы; выполнение выплат, участники отзывов и экраны относятся к последующим этапам. Продолжается Б2.

### Б2 — тарифы, поиск и отмена (8 октября 2026)

Добавлены редактирование цен/ограничений с аудитом, согласованный снимок расчёта, проверка вместимости/прав, поиск сотрудников со страницами по всему фонду (500 синтетических юнитов в тесте), пилотная отмена по замороженной политике и пределы частичных возвратов. Неизвестная отправка возврата и истёкший lease требуют сверки вместо автоматического повтора. [Подробности Б2](stages-b/02-backend.md), [отмена/возвраты](stages-b/02-cancellation-and-refunds.md).

Проверено: Core375/70 + SQL7, root245/40, сборки, сеть139/mail15; локально54 миграции, auth13/32HTTP, браузерная бронь, восстановление85 таблиц. Публичного развёртывания, нового APK, реальных SMS/денежных операций нет. Б2 ещё требует регистрации гостевого аккаунта по SMS; последующие Б3–Б11 остаются в плане, несмотря на существующие частичные реализации. Программные пробелы и внешние договоры — разные незавершённые работы.
