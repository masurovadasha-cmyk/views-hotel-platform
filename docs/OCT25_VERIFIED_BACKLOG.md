# Проверяемый backlog VIEWS — 25 октября 2026

База после fresh fetch: PR #91, `20decdfff77b2fb59e73496e6e374d1e42e7638b`, четыре CI success. Все открытые PR проверены: новая конкурирующая работа после #91 не обнаружена. Canonical repository только masurovadasha-cmyk/views-hotel-platform. Дедлайн запроса: 26 октября Asia/Tashkent (UTC+05), точный час не указан.

Это полный по-ID инвентарь существующих 140 services screens плюс отдельные платформенные сценарии, а не обещание закончить всю платформу за день. 61 partial / 79 pending / 0 fully accepted (после ограниченных H2/A1; базовый инвентарь был 56/84); все visual/functional acceptance pending. 280 RU Light/Dark изображений проверены по manifest; их просмотрщик не реализация, перевод меню не перевод PDF. UZ/EN дизайн-оригиналы не подтверждены. Core booking/property management не входит в эти 140 services IDs.

## Проверенная база и границы

Реализованы и ранее проверены: общий date-range picker; scoped quote/hold/recovery; локальный reception/inventory/owner calendar; guest trips/link/cancel; четыре Core service workflows (cleaning/laundry/market/concierge), guest list/exact details; supply/folio/refund reconciliation; demo market create/replace/cancel/complete с durable IndexedDB и общей guest/staff очередью. Полная Canva-приёмка этим не закрыта. Public web/APK — static-demo, публичный Core/email/payment отключены. 0.20 Android install/reinstall/restart доказан отдельно; потерянные 0.19 sessionStorage данные не восстановлены.

Старые CURRENT_DELIVERY_STATUS/VIEWS_NEXT_DELIVERY_GATES описывают исторические 0.15/0.7 releases; актуальный release baseline —0.20. Старые противоречивые market/D1 схемы не объединяются вслепую. Миграции 1–133 immutable.

## Конечная рабочая очередь к дедлайну

Реалистичный первый выпуск: M1+Q1+H1+QA и один проверенный web/APK. Далее продолжаем готовые M2/M3/B2 и ограниченные H2/A1/P1 по зависимостям; каждая строка закрывается только своими доказательствами. Нет обоснования обещать реализацию 84 отсутствующих экранов или production к 26 октября. Недоступные реальные интеграции остаются явно открытыми; доступные контракты/код продолжаются. Новые направления сверх этого backlog не добавляются.

| ID | Приоритет | Состояние | Критерий | Владелец | Миграция |
|---|---|---|---|---|---|
| M1 | P0 | Проверено в 0.21 / PR92 / af65312 | Освобождение lot-reserve при guest/staff cancel; auth/replay/rollback/races; runtime закрыт | core_integration | 0134 |
| Q1 | P0 | Проверено в 0.21 / PR92 / af65312 | Read-only четыре секции CRM; независимые cursors, scope, актуальный минимальный detail | frontend_integration | нет |
| H1 | P0 | Проверено в 0.21 / PR92 / af65312 | Durable block/unblock: intent до POST, current receipt, terminal absence, reload/cross-scope | booking_recovery_ui | 0135 |
| M2 | P0 | Проверено в 0.21 / PR92 / af65312 | Освобождение/перенос lot-reserve при replacement; old/successor атомарность, без runtime activation | core_integration | 0136 |
| M3 | P0 | Интегрировано в кандидат 0.22; финальный CI/Android ожидается | Выдача/потребление lot-reserve без двойного stock issue; завершить все terminal paths до runtime решения | core_integration | 0137 |
| B2 | P1 | Интегрировано в кандидат 0.22; финальный CI/Android ожидается | Durable release hold и честное сообщение о доступности; повтор/истёкший/уже отменённый результат | booking_recovery_ui | нет |
| V1 | P1 | Аудит 9ID завершён; исправления навигации/читаемости в работе | 8–12 существующих ID: route/state/proof, Light/Dark/RU/UZ/EN/mobile, без фиктивной полной приёмки | integration_qa | нет |
| P1 | P1 | Изолированная реализация ограниченного тестового контракта; ещё не интегрировано | Отдельный partner scope контракт/deny матрица/assignment isolation; не staff role, реальный вход отдельно | dependency_review / market_media | 0140 зарезервирована |
| H2 | P1 | Интегрировано в кандидат 0.22; финальный CI/Android ожидается | Read-only SH-GN-001/003 только после отдельного owner scope и минимального состава данных | dependency_review | 0138 |
| A1 | P1 | Интегрировано в кандидат 0.22; финальный CI/Android ожидается | Версионированный локальный service draft + безопасный dry-run SA-GN-001/002/009; без публикации | market_media | нет |
| S1 | P1 | Изолированная реализация ограниченного тестового контракта; ещё не интегрировано | Объяснимый существующий concierge deadline; общая утверждённая SLA матрица/рабочий календарь отдельно | booking_recovery_ui | 0139 зарезервирована |
| PHOTO | P1 | 7 лицензированных иллюстраций проверены 0.21; точныеSKU/вода открыты | Проверить оригиналы/лицензии по каждому из 8 товаров; не подменять SKU общим стоковым фото | market_media | нет |

## Остальные существующие требования, не скрытые внешними gates

- W/L: смены/назначения/нагрузка, maintenance, защищённые доказательства/фото, laundry SLA и компенсации; текущие cleaning/laundry команды не равны полной реализации всех этих процессов.
- M: FEFO, частичная выдача/начисление, delivery windows/capacity, фото инспекции, runtime lot activation после полного lifecycle.
- Q/S/N: общая глобальная сортировка/поиск истории, матрица SLA/рабочие календари/паузы/эскалация, scoped inbox/read-state, версии шаблонов. Нельзя показывать выдуманные deadlines.
- P/T/R/E/B: независимые partner identity/assignment/contracts; ручные трансферы, прокат/документы/осмотры/депозиты, экскурсионные слоты/ваучеры, реальные билеты/PNR. Наличие макета не подключает поставщика.
- H/A/F/U: услуги объекта/разрешённые заказы/комиссии/доход; service builder/price rules/availability/execution/preview; пакеты, рекомендации с согласиями; финансовое начисление не оплата, credit не refund.
- Platform: persistent staging/backup/restore/HA/observability, безопасные документы/PII, production role/MFA acceptance, нагрузки, physical Android acceptance, legal/provider approval. Существующие локальные guards/fixtures не доказательство эксплуатации.

## Внешние решения и ограничения

Нужны отдельные согласования/доступы для живого Core/БД/хостинга, реальных цен и фонда, платежей/фискализации, SMTP/SMS, E-mehmon/документов, партнёрских договоров/выплат/депозитов, release signing/физической проверки. Реальные каталожные фото требуют подтверждённых исходников/лицензий и соответствия SKU. Новые ключи, доступ, платные ресурсы, живые данные, production merge и внешние отправки запрещены текущим scope. Свежий аудит 25 октября: body-parser/multer/nodemailer и узко ограниченный ExpoCLI zod обновлены с compatibility proofs. Advisory braces отозван, obsolete exception удалён — это не package fix. Node-forge остаётся активным неисправленным tooling риском с прежним исключением до 2026-11-15.

## Контракт для Canva supplement

LocalCoreWorkspace/booking-recovery: recoveryScope, property timezone, unit/ratePlan, quoteId/expiry, immutable idempotency key, authoritative receipt. OwnerCalendarWorkspace: scope/permission, range, period revision/current state, unknown command recovery. ReceptionWorkspace: arrivals/departures/stay/turnover. GuestTrips/GuestReservationLink/GuestCancellation: guest reservation ownership, explicit acceptance/cancel, denied/revoked/expired. Q1: four permission-filtered service sections, separate cursors, minimal readonly detail; no assumed global chronology. Folio/Supply: operational charge/credit/stock separate from payments/delivery.

Каждому нужны loading/empty/offline/error; stale revision/conflict; unknown outcome/retry; revoked scope; storage corrupt/blocked; success+refresh failure; Back/Cancel/reload. RU/UZ/EN, UZS, Light/Dark/mobile. SH-GN-001–004 — услуги/комиссии/заказы/доход, не property/booking management. Старый Guest9pages/AED не канонический booking flow.

## Кандидат первой волны 0.21

Интегрированы M1/M2/Q1/H1, независимые browser proofs и семь offline лицензированных иллюстративных фото. Миграции 0134–0136 добавлены,1–133 immutable. Full aggregate/Core/CI/Android ещё должны пройти на итоговом SHA; никакие 140-ID статусы этим не повышаются. Публичный Core по-прежнему отключён; CRM/owner сценарии проверяются на disposable Core и normal-build браузере, не выдаются за подключённую функцию публичного APK. Точные фото SKU/воды остаются открытыми.

## Все 140 ID: исходный статус, существующее доказательство

Статусы сохраняются до per-ID приёмки. `partial` означает существующие reusable функции, не готовность экрана. Source: docs/design/canva-140-delivery.json; подробные зависимости каждого ID: CANVA_140_PARALLEL_QUEUE.md. Часть исторических evidence не включает последние расширения 0.16–0.20; они перечислены выше отдельно.

| ID | Роль | Название | Реализация | Visual / functional | Источник доказательства |
|---|---|---|---|---|---|
| SG-GN-001 | Гость | Услуги для вашего отдыха | partial | pending / pending | docs/design/CANVA_140_BLOCK_1.md; shared presentation only |
| SG-GN-002 | Гость | Стандартная уборка | partial | pending / pending | docs/design/CANVA_140_BLOCK_1.md; shared presentation only |
| SG-GN-003 | Гость | Пакет «Прилёт» | pending | pending / pending | None |
| SG-GN-004 | Гость | Как оплатить? | pending | pending / pending | None |
| SG-GN-005 | Гость | Заказ принят | partial | pending / pending | docs/design/CANVA_140_BLOCK_1.md; shared presentation only |
| SG-GN-006 | Гость | Мои заказы | partial | pending / pending | docs/design/CANVA_140_BLOCK_4_FEEDBACK_REPEAT.md; docs/design/CANVA_140_BLOCK_24_GUEST_SERVICE_NAV.md; docs/design/CANVA_140_BLOCK_25_ORDER_LIST.md; local four-service list, loaded-page filters and independent pagination; full visual acceptance pending; docs/design/CANVA_140_BLOCK_26_ORDER_DETAILS.md; exact read-only detail in four services, scoped fresh read; full acceptance pending; docs/design/CANVA_140_BLOCK_27_DIRECT_ORDER.md; scoped direct lookup independent of list cursor; docs/design/CANVA_140_BLOCK_28_DETAIL_CANCELLATION.md; confirmed cleaning cancellation from exact detail, full acceptance pending |
| SG-GN-007 | Гость | Ваш заказ CL-1042 | partial | pending / pending | docs/design/CANVA_140_BLOCK_1.md; shared presentation only; docs/design/CANVA_140_BLOCK_26_ORDER_DETAILS.md; exact read-only detail in four services, scoped fresh read; full acceptance pending; docs/design/CANVA_140_BLOCK_27_DIRECT_ORDER.md; scoped direct lookup independent of list cursor; docs/design/CANVA_140_BLOCK_28_DETAIL_CANCELLATION.md; confirmed cleaning cancellation from exact detail, full acceptance pending |
| SG-GN-008 | Гость | Изменить или отменить | partial | pending / pending | docs/design/CANVA_140_BLOCK_3_GUEST_CHANGES.md; cleaning before-start only, full visual acceptance pending; docs/design/CANVA_140_BLOCK_28_DETAIL_CANCELLATION.md; confirmed cleaning cancellation from exact detail, full acceptance pending |
| SG-GN-009 | Гость | Как всё прошло? | partial | pending / pending | docs/design/CANVA_140_BLOCK_4_FEEDBACK_REPEAT.md; local cleaning only; full visual and other-service acceptance pending |
| SG-GN-010 | Гость | Повторить заказ | partial | pending / pending | docs/design/CANVA_140_BLOCK_4_FEEDBACK_REPEAT.md; local cleaning only; full visual and other-service acceptance pending |
| SG-GN-011 | Гость | Для вашего путешествия | pending | pending / pending | None |
| SG-GN-012 | Гость | Уведомления | pending | pending / pending | None |
| SG-GN-013 | Гость | Добро пожаловать | partial | pending / pending | docs/design/CANVA_140_BLOCK_1.md; shared presentation only |
| SG-CL-001 | Гость | Выберите уборку | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SG-CL-002 | Гость | Когда убрать? | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SG-CL-003 | Гость | Проверьте заказ | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SG-CL-004 | Гость | Уборка запланирована | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SG-CL-005 | Гость | Уборка выполняется | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SG-CL-006 | Гость | Уборка завершена | partial | pending / pending | docs/design/CANVA_140_BLOCK_4_FEEDBACK_REPEAT.md; local cleaning only; full visual and other-service acceptance pending |
| SG-CL-007 | Гость | Вызвать техника | pending | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SG-LA-001 | Гость | Вещи в прачечную | partial | pending / pending | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending |
| SG-LA-002 | Гость | Когда забрать вещи? | partial | pending / pending | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending |
| SG-LA-003 | Гость | Проверьте опись | partial | pending / pending | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending |
| SG-LA-004 | Гость | Ваша прачечная | partial | pending / pending | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending |
| SG-LA-005 | Гость | Сообщить о вещи | partial | pending / pending | docs/design/CANVA_140_BLOCK_15_LAUNDRY_CLAIMS.md; local Core claims, photos and PDF acceptance pending |
| SG-MK-001 | Гость | Маркет в номер | partial | pending / pending | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending |
| SG-MK-002 | Гость | Ваша корзина | partial | pending / pending | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending; docs/design/CANVA_140_BLOCK_9_MARKET_REPLACEMENT.md (guest basket change before picking; not staff substitution proposals) |
| SG-MK-003 | Гость | Доставка продуктов | pending | pending / pending | None |
| SG-MK-004 | Гость | Собираем ваш заказ | partial | pending / pending | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending; docs/design/CANVA_140_BLOCK_8_MARKET_ISSUES.md (issue/answer only; no refunds or substitutions); docs/design/CANVA_140_BLOCK_9_MARKET_REPLACEMENT.md (guest basket change before picking; not staff substitution proposals); docs/design/CANVA_140_BLOCK_10_MARKET_PROPOSALS.md (warehouse proposal before picking; guest consent/decline/expiry; no refunds); docs/design/CANVA_140_BLOCK_11_MARKET_ADJUSTMENTS.md (operational credits and inspected stock returns; no provider refund); docs/design/CANVA_140_BLOCK_18_RETURN_TIMELINE.md; docs/design/CANVA_140_BLOCK_19_QUANTITY_PROPOSAL.md; docs/design/CANVA_140_BLOCK_20_REMOVE_LINE.md; docs/design/CANVA_140_BLOCK_21_REOPEN_PICKING.md; docs/design/CANVA_140_BLOCK_22_REOPEN_HISTORY.md |
| SG-CO-001 | Гость | Консьерж VIEWS | partial | pending / pending | docs/design/CANVA_140_BLOCK_13_CONCIERGE.md; local Core workflow, PDF acceptance pending |
| SG-CO-002 | Гость | Уточним поручение | partial | pending / pending | docs/design/CANVA_140_BLOCK_13_CONCIERGE.md; local Core workflow, PDF acceptance pending |
| SG-CO-003 | Гость | Ищем стол для вас | partial | pending / pending | docs/design/CANVA_140_BLOCK_13_CONCIERGE.md; local Core workflow, PDF acceptance pending |
| SG-TX-001 | Гость | Куда поедем? | pending | pending / pending | None |
| SG-TX-002 | Гость | Выберите автомобиль | pending | pending / pending | None |
| SG-TX-003 | Гость | Водитель едет к вам | pending | pending / pending | None |
| SG-TX-004 | Гость | Поездка завершена | pending | pending / pending | None |
| SG-CR-001 | Гость | Авто для ваших планов | pending | pending / pending | None |
| SG-CR-002 | Гость | Leapmotor C01 | pending | pending / pending | None |
| SG-CR-003 | Гость | Данные водителя | pending | pending / pending | None |
| SG-CR-004 | Гость | Оплата и залог | pending | pending / pending | None |
| SG-CR-005 | Гость | Договор аренды | pending | pending / pending | None |
| SG-CR-006 | Гость | Осмотр перед выдачей | pending | pending / pending | None |
| SG-CR-007 | Гость | Продлить аренду | pending | pending / pending | None |
| SG-CR-008 | Гость | Возврат автомобиля | pending | pending / pending | None |
| SG-EX-001 | Гость | Откройте Ташкент | pending | pending / pending | None |
| SG-EX-002 | Гость | Старый Ташкент | pending | pending / pending | None |
| SG-EX-003 | Гость | Дата и участники | pending | pending / pending | None |
| SG-EX-004 | Гость | Ваш ваучер | pending | pending / pending | None |
| SG-TK-001 | Гость | Авиа и ж/д билеты | pending | pending / pending | None |
| SG-TK-002 | Гость | Ташкент → Самарканд | pending | pending / pending | None |
| SG-TK-003 | Гость | Условия билета | pending | pending / pending | None |
| SG-TK-004 | Гость | Пассажир | pending | pending / pending | None |
| SG-TK-005 | Гость | Проверка цены | pending | pending / pending | None |
| SG-TK-006 | Гость | Электронный билет | pending | pending / pending | None |
| SG-TK-007 | Гость | Оформление у партнёра | pending | pending / pending | None |
| SD-CL-001 | CRM / диспетчер | Состояние номеров | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SD-CL-002 | CRM / диспетчер | График горничных | pending | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SD-CL-003 | CRM / диспетчер | Контроль уборки | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SD-CL-004 | CRM / диспетчер | Ремонт и обслуживание | pending | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SD-LA-001 | CRM / диспетчер | Очередь прачечной | partial | pending / pending | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending |
| SD-LA-002 | CRM / диспетчер | Учёт и расчёты | partial | pending / pending | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending |
| SD-LA-003 | CRM / диспетчер | Претензия LA-1081 | partial | pending / pending | docs/design/CANVA_140_BLOCK_15_LAUNDRY_CLAIMS.md; local Core claims, photos and PDF acceptance pending |
| SD-MK-001 | CRM / диспетчер | Остатки и сборка | partial | pending / pending | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending; docs/design/CANVA_140_BLOCK_23_RECEIPT_LOTS.md (receipt metadata only; no FEFO); docs/SUPPLY_LOT_COUNT_L1.md (physical lot snapshot; not live balances); docs/SUPPLY_LOT_MOVEMENT_L2A.md (intake evidence only; allocation disabled); docs/SUPPLY_COUNTED_LOT_ISSUE_L2B.md (manual single-lot issue; no live lot balances) |
| SD-MK-002 | CRM / диспетчер | Доставки и исключения | partial | pending / pending | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending; docs/design/CANVA_140_BLOCK_8_MARKET_ISSUES.md (issue/answer only; no refunds or substitutions); docs/design/CANVA_140_BLOCK_9_MARKET_REPLACEMENT.md (guest basket change before picking; not staff substitution proposals); docs/design/CANVA_140_BLOCK_10_MARKET_PROPOSALS.md (warehouse proposal before picking; guest consent/decline/expiry; no refunds); docs/design/CANVA_140_BLOCK_11_MARKET_ADJUSTMENTS.md (operational credits and inspected stock returns; no provider refund); docs/design/CANVA_140_BLOCK_18_RETURN_TIMELINE.md; docs/design/CANVA_140_BLOCK_19_QUANTITY_PROPOSAL.md; docs/design/CANVA_140_BLOCK_20_REMOVE_LINE.md; docs/design/CANVA_140_BLOCK_21_REOPEN_PICKING.md; docs/design/CANVA_140_BLOCK_22_REOPEN_HISTORY.md |
| SD-CO-001 | CRM / диспетчер | Входящие консьержа | partial | pending / pending | docs/design/CANVA_140_BLOCK_13_CONCIERGE.md; local Core workflow, PDF acceptance pending |
| SD-CO-002 | CRM / диспетчер | Ответ по CO-309 | partial | pending / pending | docs/design/CANVA_140_BLOCK_13_CONCIERGE.md; local Core workflow, PDF acceptance pending |
| SD-CO-003 | CRM / диспетчер | Профиль гостя | partial | pending / pending | docs/design/CANVA_140_BLOCK_14_CONCIERGE_SUPPORT.md; local Core workflow, PDF acceptance pending |
| SD-CO-004 | CRM / диспетчер | База знаний | partial | pending / pending | docs/design/CANVA_140_BLOCK_14_CONCIERGE_SUPPORT.md; local Core workflow, PDF acceptance pending |
| SD-TX-001 | CRM / диспетчер | Карта транспорта | pending | pending / pending | None |
| SD-TX-002 | CRM / диспетчер | Ручной трансфер | pending | pending / pending | None |
| SD-CR-001 | CRM / диспетчер | Календарь автопарка | pending | pending / pending | None |
| SD-CR-002 | CRM / диспетчер | Выдачи и возвраты | pending | pending / pending | None |
| SD-EX-001 | CRM / диспетчер | Экскурсии и гиды | pending | pending / pending | None |
| SD-EX-002 | CRM / диспетчер | Как продаём экскурсию? | pending | pending / pending | None |
| SD-TK-001 | CRM / диспетчер | Билетная очередь | pending | pending / pending | None |
| SD-TK-002 | CRM / диспетчер | Изменение билета | pending | pending / pending | None |
| SD-GN-001 | CRM / диспетчер | Все заказы | partial | pending / pending | docs/design/CANVA_140_BLOCK_1.md; shared presentation only |
| SD-GN-002 | CRM / диспетчер | Карта заказов | pending | pending / pending | None |
| SD-GN-003 | CRM / диспетчер | Нарушения SLA | pending | pending / pending | None |
| SD-GN-004 | CRM / диспетчер | Заказ CL-1042 | partial | pending / pending | docs/design/CANVA_140_BLOCK_1.md; shared presentation only |
| SD-GN-005 | CRM / диспетчер | Назначение сотрудника | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SD-GN-006 | CRM / диспетчер | Лестница эскалации | pending | pending / pending | None |
| SD-GN-007 | CRM / диспетчер | Услуги: показатели | pending | pending / pending | None |
| SD-GN-008 | CRM / диспетчер | Финансы CL-1042 | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity; docs/design/CANVA_140_BLOCK_11_MARKET_ADJUSTMENTS.md (operational credits and inspected stock returns; no provider refund) |
| SD-GN-009 | CRM / диспетчер | Партнёры и назначения | pending | pending / pending | None |
| SS-CL-001 | Персонал | Номера на смену | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SS-CL-002 | Персонал | Уборка #235 | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SS-CL-003 | Персонал | Проверка #235 | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SS-CL-004 | Персонал | Кондиционер #235 | pending | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SS-LA-001 | Персонал | Приёмка вещей | partial | pending / pending | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending |
| SS-LA-002 | Персонал | Обработка LA-1081 | partial | pending / pending | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending |
| SS-LA-003 | Персонал | Вернуть вещи гостю | partial | pending / pending | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending |
| SS-MK-001 | Персонал | Сборка MK-2041 | partial | pending / pending | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending; docs/design/CANVA_140_BLOCK_10_MARKET_PROPOSALS.md (warehouse proposal before picking; guest consent/decline/expiry; no refunds); docs/design/CANVA_140_BLOCK_11_MARKET_ADJUSTMENTS.md (operational credits and inspected stock returns; no provider refund); docs/design/CANVA_140_BLOCK_18_RETURN_TIMELINE.md; docs/design/CANVA_140_BLOCK_19_QUANTITY_PROPOSAL.md; docs/design/CANVA_140_BLOCK_20_REMOVE_LINE.md; docs/design/CANVA_140_BLOCK_21_REOPEN_PICKING.md; docs/design/CANVA_140_BLOCK_22_REOPEN_HISTORY.md |
| SS-MK-002 | Персонал | Передать заказ | partial | pending / pending | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending |
| SS-CO-001 | Персонал | Поручение CO-309 | partial | pending / pending | docs/design/CANVA_140_BLOCK_13_CONCIERGE.md; local Core workflow, PDF acceptance pending |
| SS-GN-001 | Персонал | Мои задания | partial | pending / pending | docs/design/CANVA_140_BLOCK_1.md; shared presentation only |
| SS-GN-002 | Персонал | Задание CL-1042 | partial | pending / pending | docs/design/CANVA_140_BLOCK_1.md; shared presentation only |
| SS-GN-003 | Персонал | Начать уборку | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SS-GN-004 | Персонал | Чек-лист и фото | partial | pending / pending | docs/design/CANVA_140_BLOCK_1.md; shared presentation only |
| SS-GN-005 | Персонал | Отправить на проверку | partial | pending / pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity |
| SS-GN-006 | Персонал | Нет соединения | partial | pending / pending | docs/design/CANVA_140_BLOCK_1.md; shared presentation only |
| SS-GN-007 | Персонал | Сообщить о проблеме | pending | pending / pending | None |
| SS-GN-008 | Персонал | Моя смена | pending | pending / pending | None |
| SS-GN-009 | Персонал | Показатели и бонусы | pending | pending / pending | None |
| SS-GN-010 | Персонал | Уведомления | pending | pending / pending | None |
| SP-MK-001 | Партнёр | Доставка в #235 | pending | pending / pending | None |
| SP-TX-001 | Партнёр | Новый трансфер | pending | pending / pending | None |
| SP-TX-002 | Партнёр | Трансфер TX-809 | pending | pending / pending | None |
| SP-CR-001 | Партнёр | Проверка водителя | pending | pending / pending | None |
| SP-CR-002 | Партнёр | Выдача CR-601 | pending | pending / pending | None |
| SP-CR-003 | Партнёр | Приём автомобиля | pending | pending / pending | None |
| SP-EX-001 | Партнёр | Мои группы | pending | pending / pending | None |
| SP-EX-002 | Партнёр | Участники экскурсии | pending | pending / pending | None |
| SP-TK-001 | Партнёр | Заявка на выписку | pending | pending / pending | None |
| SP-TK-002 | Партнёр | Выписка и изменения | pending | pending / pending | None |
| SP-GN-001 | Партнёр | Входящие заказы | pending | pending / pending | None |
| SP-GN-002 | Партнёр | Принять заказ | pending | pending / pending | None |
| SP-GN-003 | Партнёр | Исполнение заказа | pending | pending / pending | None |
| SP-GN-004 | Партнёр | Акты и выплаты | pending | pending / pending | None |
| SP-GN-005 | Партнёр | Календарь партнёра | pending | pending / pending | None |
| SP-GN-006 | Партнёр | Портал партнёра | pending | pending / pending | None |
| SH-GN-001 | Хост | Услуги объекта | partial | pending / pending | docs/OWNER_SERVICES_H2_20261025.md; authenticated local read-only active catalog/current orders, no commissions/income or public Core |
| SH-GN-002 | Хост | Цена и комиссия | pending | pending / pending | None |
| SH-GN-003 | Хост | Заказы гостей | partial | pending / pending | docs/OWNER_SERVICES_H2_20261025.md; authenticated local read-only active catalog/current orders, no commissions/income or public Core |
| SH-GN-004 | Хост | Доход от услуг | pending | pending / pending | None |
| SA-GN-001 | Администратор | Название услуги | partial | pending / pending | src/features/service-builder/README.md; local versioned draft and dry-run only, no publication/price/upload/routing/Core catalog |
| SA-GN-002 | Администратор | Поля формы | partial | pending / pending | src/features/service-builder/README.md; local versioned draft and dry-run only, no publication/price/upload/routing/Core catalog |
| SA-GN-003 | Администратор | Правила цены | pending | pending / pending | None |
| SA-GN-004 | Администратор | Доступность услуги | pending | pending / pending | None |
| SA-GN-005 | Администратор | Способ исполнения | pending | pending / pending | None |
| SA-GN-006 | Администратор | Сроки по этапам | pending | pending / pending | None |
| SA-GN-007 | Администратор | Кому направить заказ? | pending | pending / pending | None |
| SA-GN-008 | Администратор | Уведомления | pending | pending / pending | None |
| SA-GN-009 | Администратор | Предпросмотр услуги | partial | pending / pending | src/features/service-builder/README.md; local versioned draft and dry-run only, no publication/price/upload/routing/Core catalog |
| SA-GN-010 | Администратор | Матрица SLA | pending | pending / pending | None |
| SA-GN-011 | Администратор | Шаблоны сообщений | pending | pending / pending | None |
| SA-GN-012 | Администратор | Правила объекта | pending | pending / pending | None |
| SA-GN-013 | Администратор | Справочники и права | pending | pending / pending | None |
| SA-GN-014 | Администратор | Партнёры и зарплата | pending | pending / pending | None |
| SA-GN-015 | Администратор | Журнал интеграций | pending | pending / pending | None |

## Обновление после 0.21 и кандидат 0.22

0.21 проверена на af653127d781d452aee7c98477eaa9dcb04891d7, PR92, все четыре проверки success, Android update/restart/reserve/cancel PASS. Library libfile_d0cab2e927808191bb7573804f4e7ea5. Фото семи товаров — лицензированные иллюстрации, не доказательство точного SKU; вода без фото.

Кандидат 0.22 включает M3/B2/H2/A1; финальные CI/Android ещё должны завершиться. Пять ID H2/A1 повышены только до partial на основании новых ограниченных рабочих сценариев; visual/functional acceptance всех 140 остаётся pending. Аудит девяти ID и 28 скриншотов: docs/NINE_SCREEN_VISUAL_AUDIT_20261025.md.

Следующая конечная волна: V1 прямой вход в маркет/корзину и читаемая очередь; S1 сохранённые черновики SLA и объяснимый расчёт рабочего календаря без активации; P1 отдельное синтетическое предложение concierge партнёру и accept/reject без исполнения услуги. Новые направления не добавлены.

Canva supplement IDs от родителя: CG-BK-008 quote/hold expiry; CG-BK-010 неизвестный результат и тот же ключ; CG-BK-017 offline/corrupt store; CH-OP-006 конфликт дат и block/unblock recovery; CS-FO-004 запись успешна, refresh неуспешен; CA-CR-006 scope объекта; CA-CR-009 read-after-write recovery; CA-CR-012 read-only четыре услуги. Это mapping макетов, не доказательства готовности. Номер брони VW и request key REQ раздельны. UZ/EN дизайн-драфты родителя не означают принятые языковые макеты; pending Canva approval не блокирует engineering.
