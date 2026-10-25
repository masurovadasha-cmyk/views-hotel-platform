# QA-матрица VIEWS: волна 1, 25 октября 2026

Базис: `20decdfff77b2fb59e73496e6e374d1e42e7638b`. Этот backlog получен из
`docs/design/canva-140-delivery.json`; он не повышает статусы реестра.
140 ID: 56 partial / 84 pending, visualAcceptance и functionalAcceptance pending
для всех 140, runtimeParity not_verified. Inventory/delivery ID совпадают;
280 WebP проверены по SHA-256 manifest без ошибок. Это референсы, не 280 рабочих экранов.

## Конечная волна

| Пакет | Независимая приёмка | Что не объявляется завершённым |
|---|---|---|
| Q1 | Общая read-only Core очередь четырёх услуг: отдельная пагинация, summary, разрешённые роли, forbidden/disabled, ошибка/offline, устаревший ответ и смена scope | SD-GN-001/004 остаются partial; summary не полная карточка и не межсервисные команды |
| H1 | Owner block/unblock: intent до POST, неизвестный результат/reload/повтор, scope, календарные границы, отмена/Back, однозначное разрешение, повреждённое хранилище | Не подтверждает все экраны SH-GN; соответствие конкретному PDF-ID требует сравнения |
| M1 | Core отмена зарезервированных партий: release ровно один раз, неизменность потреблённого/чужого остатка, права и конкурентные повторы | Не реальная доставка, возврат провайдера или полная приёмка SD-MK/SG-MK |
| Регрессия | RU/UZ/EN, Light/Dark, 360/768/1440; загрузка/пусто/ошибка/offline, роль/scope, Back/повтор; календарь/рынок/фото сохраняются | Матрица комбинаций не заменяет ручную по-ID визуальную приёмку |
| Выпуск | Точный clean SHA/CI/branch preview; Android тот же debug сертификат, upgrade/restart/state/back/keyboard smoke | Не production и не физическая сертификация устройства |

Для SD-GN-001 и SD-GN-004 план визуальной сверки: открыть обе сохранённые WebP,
сопоставить с runtime того же сценария при ширинах 360 и 1440; записать каждый
разрыв структуры/типографики/данных/действий. Для локалей RU/UZ/EN проверить
переносы и доступные названия; исходные PDF-картинки на русском не становятся
локализованными при переключении языка просмотрщика. До выполнения сравнения
visualAcceptance остаётся pending. Доказательства браузера хранят exact SHA,
режим сборки, случаи и ограничения; no write API в read-only Q1.

Полный базовый cross-product всех ID × 3 языка × 2 темы × 3 ширины = 2520
комбинаций ещё до состояний. Реалистичный результат к 26 октября — эта конечная
волна и проверяемый backlog всех ID; не необоснованная отметка «140 готовы».

## Состояние доказательств и устаревшие сведения

232 demo-layout и 289 Core-layout предыдущих доказательств не являются
140-ID pixel-parity. Design viewer tests проверяют фильтры/изображения/навигацию;
они не исполняют 140 workflows. Тесты с hardcoded 84 pending / всеми pending
нужно менять только вместе с доказанным изменением реестра, не ради зелёного CI.
`VIEWS_NEXT_DELIVERY_GATES.md`, конец CODEX_HANDOFF и старые Canva release notes
содержат исторические release/signing/Cloudflare состояния. Их нельзя выдавать
за текущее состояние 0.20. Фото апартаментов проверяются; демокаталог рынка пока
использует иллюстративные значки, не реальные фото SKU.

Read-only проверка окружения: SDK platform35/build-tools35, adb/emulator и
существующий Expo template debug-key member есть. Ключ не извлекался. SDK env
переменные unset — требуется указать существующий путь, не создавать identity.
Library содержит `VIEWS-0.20.0-Integration-Demo.apk`, 8987899 bytes,
`libfile_2d9954fd70f081919353bc79e75b934a`. Это проверка наличия метаданных,
не повторная проверка APK bytes/установки. Источник 140 PDF также доступен в
Library: `libfile_b53b741e9d64819198445000a16b22ca`; прежняя локальная нехватка
файла не означает, что исходник потерян. Загрузка и изменение Library не выполнялись.

## Полный backlog 140 ID

В таблице «доказательство» — существующая ссылка реестра, а не новый PASS.
Для каждой строки открыты полная визуальная и функциональная приёмка.

| ID | Область / экран | Light / Dark | Реализация | Существующее доказательство | Следующий QA gate |
|---|---|---|---|---|---|
| SG-GN-001 | guest · Услуги для вашего отдыха | 1 / 56 | partial | docs/design/CANVA_140_BLOCK_1.md; shared presentation only | Законченный сценарий + per-ID visual parity |
| SG-GN-002 | guest · Стандартная уборка | 2 / 57 | partial | docs/design/CANVA_140_BLOCK_1.md; shared presentation only | Законченный сценарий + per-ID visual parity |
| SG-GN-003 | guest · Пакет «Прилёт» | 3 / 58 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-GN-004 | guest · Как оплатить? | 4 / 59 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-GN-005 | guest · Заказ принят | 5 / 60 | partial | docs/design/CANVA_140_BLOCK_1.md; shared presentation only | Законченный сценарий + per-ID visual parity |
| SG-GN-006 | guest · Мои заказы | 6 / 61 | partial | docs/design/CANVA_140_BLOCK_4_FEEDBACK_REPEAT.md; docs/design/CANVA_140_BLOCK_24_GUEST_SERVICE_NAV.md; docs/design/CANVA_140_BLOCK_25_ORDER_LIST.md; local four-service list, loaded-page filters and independent pagination; full visual acceptance pending; docs/design/CANVA_140_BLOCK_26_ORDER_DETAILS.md; exact read-only detail in four services, scoped fresh read; full acceptance pending; docs/design/CANVA_140_BLOCK_27_DIRECT_ORDER.md; scoped direct lookup independent of list cursor; docs/design/CANVA_140_BLOCK_28_DETAIL_CANCELLATION.md; confirmed cleaning cancellation from exact detail, full acceptance pending | Законченный сценарий + per-ID visual parity |
| SG-GN-007 | guest · Ваш заказ CL-1042 | 7 / 62 | partial | docs/design/CANVA_140_BLOCK_1.md; shared presentation only; docs/design/CANVA_140_BLOCK_26_ORDER_DETAILS.md; exact read-only detail in four services, scoped fresh read; full acceptance pending; docs/design/CANVA_140_BLOCK_27_DIRECT_ORDER.md; scoped direct lookup independent of list cursor; docs/design/CANVA_140_BLOCK_28_DETAIL_CANCELLATION.md; confirmed cleaning cancellation from exact detail, full acceptance pending | Законченный сценарий + per-ID visual parity |
| SG-GN-008 | guest · Изменить или отменить | 8 / 63 | partial | docs/design/CANVA_140_BLOCK_3_GUEST_CHANGES.md; cleaning before-start only, full visual acceptance pending; docs/design/CANVA_140_BLOCK_28_DETAIL_CANCELLATION.md; confirmed cleaning cancellation from exact detail, full acceptance pending | Законченный сценарий + per-ID visual parity |
| SG-GN-009 | guest · Как всё прошло? | 9 / 64 | partial | docs/design/CANVA_140_BLOCK_4_FEEDBACK_REPEAT.md; local cleaning only; full visual and other-service acceptance pending | Законченный сценарий + per-ID visual parity |
| SG-GN-010 | guest · Повторить заказ | 10 / 65 | partial | docs/design/CANVA_140_BLOCK_4_FEEDBACK_REPEAT.md; local cleaning only; full visual and other-service acceptance pending | Законченный сценарий + per-ID visual parity |
| SG-GN-011 | guest · Для вашего путешествия | 11 / 66 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-GN-012 | guest · Уведомления | 12 / 67 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-GN-013 | guest · Добро пожаловать | 13 / 68 | partial | docs/design/CANVA_140_BLOCK_1.md; shared presentation only | Законченный сценарий + per-ID visual parity |
| SG-CL-001 | guest · Выберите уборку | 14 / 69 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SG-CL-002 | guest · Когда убрать? | 15 / 70 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SG-CL-003 | guest · Проверьте заказ | 16 / 71 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SG-CL-004 | guest · Уборка запланирована | 17 / 72 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SG-CL-005 | guest · Уборка выполняется | 18 / 73 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SG-CL-006 | guest · Уборка завершена | 19 / 74 | partial | docs/design/CANVA_140_BLOCK_4_FEEDBACK_REPEAT.md; local cleaning only; full visual and other-service acceptance pending | Законченный сценарий + per-ID visual parity |
| SG-CL-007 | guest · Вызвать техника | 20 / 75 | pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Runtime + права/состояния + visual parity |
| SG-LA-001 | guest · Вещи в прачечную | 21 / 76 | partial | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending | Законченный сценарий + per-ID visual parity |
| SG-LA-002 | guest · Когда забрать вещи? | 22 / 77 | partial | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending | Законченный сценарий + per-ID visual parity |
| SG-LA-003 | guest · Проверьте опись | 23 / 78 | partial | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending | Законченный сценарий + per-ID visual parity |
| SG-LA-004 | guest · Ваша прачечная | 24 / 79 | partial | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending | Законченный сценарий + per-ID visual parity |
| SG-LA-005 | guest · Сообщить о вещи | 25 / 80 | partial | docs/design/CANVA_140_BLOCK_15_LAUNDRY_CLAIMS.md; local Core claims, photos and PDF acceptance pending | Законченный сценарий + per-ID visual parity |
| SG-MK-001 | guest · Маркет в номер | 26 / 81 | partial | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending | Законченный сценарий + per-ID visual parity |
| SG-MK-002 | guest · Ваша корзина | 27 / 82 | partial | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending; docs/design/CANVA_140_BLOCK_9_MARKET_REPLACEMENT.md (guest basket change before picking; not staff substitution proposals) | Законченный сценарий + per-ID visual parity |
| SG-MK-003 | guest · Доставка продуктов | 28 / 83 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-MK-004 | guest · Собираем ваш заказ | 29 / 84 | partial | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending; docs/design/CANVA_140_BLOCK_8_MARKET_ISSUES.md (issue/answer only; no refunds or substitutions); docs/design/CANVA_140_BLOCK_9_MARKET_REPLACEMENT.md (guest basket change before picking; not staff substitution proposals); docs/design/CANVA_140_BLOCK_10_MARKET_PROPOSALS.md (warehouse proposal before picking; guest consent/decline/expiry; no refunds); docs/design/CANVA_140_BLOCK_11_MARKET_ADJUSTMENTS.md (operational credits and inspected stock returns; no provider refund); docs/design/CANVA_140_BLOCK_18_RETURN_TIMELINE.md; docs/design/CANVA_140_BLOCK_19_QUANTITY_PROPOSAL.md; docs/design/CANVA_140_BLOCK_20_REMOVE_LINE.md; docs/design/CANVA_140_BLOCK_21_REOPEN_PICKING.md; docs/design/CANVA_140_BLOCK_22_REOPEN_HISTORY.md | Законченный сценарий + per-ID visual parity |
| SG-CO-001 | guest · Консьерж VIEWS | 30 / 85 | partial | docs/design/CANVA_140_BLOCK_13_CONCIERGE.md; local Core workflow, PDF acceptance pending | Законченный сценарий + per-ID visual parity |
| SG-CO-002 | guest · Уточним поручение | 31 / 86 | partial | docs/design/CANVA_140_BLOCK_13_CONCIERGE.md; local Core workflow, PDF acceptance pending | Законченный сценарий + per-ID visual parity |
| SG-CO-003 | guest · Ищем стол для вас | 32 / 87 | partial | docs/design/CANVA_140_BLOCK_13_CONCIERGE.md; local Core workflow, PDF acceptance pending | Законченный сценарий + per-ID visual parity |
| SG-TX-001 | guest · Куда поедем? | 33 / 88 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-TX-002 | guest · Выберите автомобиль | 34 / 89 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-TX-003 | guest · Водитель едет к вам | 35 / 90 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-TX-004 | guest · Поездка завершена | 36 / 91 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-CR-001 | guest · Авто для ваших планов | 37 / 92 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-CR-002 | guest · Leapmotor C01 | 38 / 93 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-CR-003 | guest · Данные водителя | 39 / 94 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-CR-004 | guest · Оплата и залог | 40 / 95 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-CR-005 | guest · Договор аренды | 41 / 96 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-CR-006 | guest · Осмотр перед выдачей | 42 / 97 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-CR-007 | guest · Продлить аренду | 43 / 98 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-CR-008 | guest · Возврат автомобиля | 44 / 99 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-EX-001 | guest · Откройте Ташкент | 45 / 100 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-EX-002 | guest · Старый Ташкент | 46 / 101 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-EX-003 | guest · Дата и участники | 47 / 102 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-EX-004 | guest · Ваш ваучер | 48 / 103 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-TK-001 | guest · Авиа и ж/д билеты | 49 / 104 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-TK-002 | guest · Ташкент → Самарканд | 50 / 105 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-TK-003 | guest · Условия билета | 51 / 106 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-TK-004 | guest · Пассажир | 52 / 107 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-TK-005 | guest · Проверка цены | 53 / 108 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-TK-006 | guest · Электронный билет | 54 / 109 | pending | Нет | Runtime + права/состояния + visual parity |
| SG-TK-007 | guest · Оформление у партнёра | 55 / 110 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-CL-001 | dispatcher · Состояние номеров | 111 / 141 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SD-CL-002 | dispatcher · График горничных | 112 / 142 | pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Runtime + права/состояния + visual parity |
| SD-CL-003 | dispatcher · Контроль уборки | 113 / 143 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SD-CL-004 | dispatcher · Ремонт и обслуживание | 114 / 144 | pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Runtime + права/состояния + visual parity |
| SD-LA-001 | dispatcher · Очередь прачечной | 115 / 145 | partial | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending | Законченный сценарий + per-ID visual parity |
| SD-LA-002 | dispatcher · Учёт и расчёты | 116 / 146 | partial | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending | Законченный сценарий + per-ID visual parity |
| SD-LA-003 | dispatcher · Претензия LA-1081 | 117 / 147 | partial | docs/design/CANVA_140_BLOCK_15_LAUNDRY_CLAIMS.md; local Core claims, photos and PDF acceptance pending | Законченный сценарий + per-ID visual parity |
| SD-MK-001 | dispatcher · Остатки и сборка | 118 / 148 | partial | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending; docs/design/CANVA_140_BLOCK_23_RECEIPT_LOTS.md (receipt metadata only; no FEFO); docs/SUPPLY_LOT_COUNT_L1.md (physical lot snapshot; not live balances); docs/SUPPLY_LOT_MOVEMENT_L2A.md (intake evidence only; allocation disabled); docs/SUPPLY_COUNTED_LOT_ISSUE_L2B.md (manual single-lot issue; no live lot balances) | Законченный сценарий + per-ID visual parity |
| SD-MK-002 | dispatcher · Доставки и исключения | 119 / 149 | partial | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending; docs/design/CANVA_140_BLOCK_8_MARKET_ISSUES.md (issue/answer only; no refunds or substitutions); docs/design/CANVA_140_BLOCK_9_MARKET_REPLACEMENT.md (guest basket change before picking; not staff substitution proposals); docs/design/CANVA_140_BLOCK_10_MARKET_PROPOSALS.md (warehouse proposal before picking; guest consent/decline/expiry; no refunds); docs/design/CANVA_140_BLOCK_11_MARKET_ADJUSTMENTS.md (operational credits and inspected stock returns; no provider refund); docs/design/CANVA_140_BLOCK_18_RETURN_TIMELINE.md; docs/design/CANVA_140_BLOCK_19_QUANTITY_PROPOSAL.md; docs/design/CANVA_140_BLOCK_20_REMOVE_LINE.md; docs/design/CANVA_140_BLOCK_21_REOPEN_PICKING.md; docs/design/CANVA_140_BLOCK_22_REOPEN_HISTORY.md | Законченный сценарий + per-ID visual parity |
| SD-CO-001 | dispatcher · Входящие консьержа | 120 / 150 | partial | docs/design/CANVA_140_BLOCK_13_CONCIERGE.md; local Core workflow, PDF acceptance pending | Законченный сценарий + per-ID visual parity |
| SD-CO-002 | dispatcher · Ответ по CO-309 | 121 / 151 | partial | docs/design/CANVA_140_BLOCK_13_CONCIERGE.md; local Core workflow, PDF acceptance pending | Законченный сценарий + per-ID visual parity |
| SD-CO-003 | dispatcher · Профиль гостя | 122 / 152 | partial | docs/design/CANVA_140_BLOCK_14_CONCIERGE_SUPPORT.md; local Core workflow, PDF acceptance pending | Законченный сценарий + per-ID visual parity |
| SD-CO-004 | dispatcher · База знаний | 123 / 153 | partial | docs/design/CANVA_140_BLOCK_14_CONCIERGE_SUPPORT.md; local Core workflow, PDF acceptance pending | Законченный сценарий + per-ID visual parity |
| SD-TX-001 | dispatcher · Карта транспорта | 124 / 154 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-TX-002 | dispatcher · Ручной трансфер | 125 / 155 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-CR-001 | dispatcher · Календарь автопарка | 126 / 156 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-CR-002 | dispatcher · Выдачи и возвраты | 127 / 157 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-EX-001 | dispatcher · Экскурсии и гиды | 128 / 158 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-EX-002 | dispatcher · Как продаём экскурсию? | 129 / 159 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-TK-001 | dispatcher · Билетная очередь | 130 / 160 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-TK-002 | dispatcher · Изменение билета | 131 / 161 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-GN-001 | dispatcher · Все заказы | 132 / 162 | partial | docs/design/CANVA_140_BLOCK_1.md; shared presentation only | Q1: read-only очередь/summary; полная приёмка открыта |
| SD-GN-002 | dispatcher · Карта заказов | 133 / 163 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-GN-003 | dispatcher · Нарушения SLA | 134 / 164 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-GN-004 | dispatcher · Заказ CL-1042 | 135 / 165 | partial | docs/design/CANVA_140_BLOCK_1.md; shared presentation only | Q1: read-only очередь/summary; полная приёмка открыта |
| SD-GN-005 | dispatcher · Назначение сотрудника | 136 / 166 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SD-GN-006 | dispatcher · Лестница эскалации | 137 / 167 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-GN-007 | dispatcher · Услуги: показатели | 138 / 168 | pending | Нет | Runtime + права/состояния + visual parity |
| SD-GN-008 | dispatcher · Финансы CL-1042 | 139 / 169 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity; docs/design/CANVA_140_BLOCK_11_MARKET_ADJUSTMENTS.md (operational credits and inspected stock returns; no provider refund) | Законченный сценарий + per-ID visual parity |
| SD-GN-009 | dispatcher · Партнёры и назначения | 140 / 170 | pending | Нет | Runtime + права/состояния + visual parity |
| SS-CL-001 | staff · Номера на смену | 171 / 191 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SS-CL-002 | staff · Уборка #235 | 172 / 192 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SS-CL-003 | staff · Проверка #235 | 173 / 193 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SS-CL-004 | staff · Кондиционер #235 | 174 / 194 | pending | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Runtime + права/состояния + visual parity |
| SS-LA-001 | staff · Приёмка вещей | 175 / 195 | partial | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending | Законченный сценарий + per-ID visual parity |
| SS-LA-002 | staff · Обработка LA-1081 | 176 / 196 | partial | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending | Законченный сценарий + per-ID visual parity |
| SS-LA-003 | staff · Вернуть вещи гостю | 177 / 197 | partial | docs/design/CANVA_140_BLOCK_6_LAUNDRY_WEB.md; local guest/manager workflow; PDF acceptance and dedicated laundry staff role pending | Законченный сценарий + per-ID visual parity |
| SS-MK-001 | staff · Сборка MK-2041 | 178 / 198 | partial | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending; docs/design/CANVA_140_BLOCK_10_MARKET_PROPOSALS.md (warehouse proposal before picking; guest consent/decline/expiry; no refunds); docs/design/CANVA_140_BLOCK_11_MARKET_ADJUSTMENTS.md (operational credits and inspected stock returns; no provider refund); docs/design/CANVA_140_BLOCK_18_RETURN_TIMELINE.md; docs/design/CANVA_140_BLOCK_19_QUANTITY_PROPOSAL.md; docs/design/CANVA_140_BLOCK_20_REMOVE_LINE.md; docs/design/CANVA_140_BLOCK_21_REOPEN_PICKING.md; docs/design/CANVA_140_BLOCK_22_REOPEN_HISTORY.md | Законченный сценарий + per-ID visual parity |
| SS-MK-002 | staff · Передать заказ | 179 / 199 | partial | docs/design/CANVA_140_BLOCK_7_MARKET_CORE_WEB.md; own-stock basket/reserve/picking/handover; delivery, substitutions and PDF acceptance pending | Законченный сценарий + per-ID visual parity |
| SS-CO-001 | staff · Поручение CO-309 | 180 / 200 | partial | docs/design/CANVA_140_BLOCK_13_CONCIERGE.md; local Core workflow, PDF acceptance pending | Законченный сценарий + per-ID visual parity |
| SS-GN-001 | staff · Мои задания | 181 / 201 | partial | docs/design/CANVA_140_BLOCK_1.md; shared presentation only | Законченный сценарий + per-ID visual parity |
| SS-GN-002 | staff · Задание CL-1042 | 182 / 202 | partial | docs/design/CANVA_140_BLOCK_1.md; shared presentation only | Законченный сценарий + per-ID visual parity |
| SS-GN-003 | staff · Начать уборку | 183 / 203 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SS-GN-004 | staff · Чек-лист и фото | 184 / 204 | partial | docs/design/CANVA_140_BLOCK_1.md; shared presentation only | Законченный сценарий + per-ID visual parity |
| SS-GN-005 | staff · Отправить на проверку | 185 / 205 | partial | docs/SERVICE_CLEANING_WEB.md; partial workflow, not full screen parity | Законченный сценарий + per-ID visual parity |
| SS-GN-006 | staff · Нет соединения | 186 / 206 | partial | docs/design/CANVA_140_BLOCK_1.md; shared presentation only | Законченный сценарий + per-ID visual parity |
| SS-GN-007 | staff · Сообщить о проблеме | 187 / 207 | pending | Нет | Runtime + права/состояния + visual parity |
| SS-GN-008 | staff · Моя смена | 188 / 208 | pending | Нет | Runtime + права/состояния + visual parity |
| SS-GN-009 | staff · Показатели и бонусы | 189 / 209 | pending | Нет | Runtime + права/состояния + visual parity |
| SS-GN-010 | staff · Уведомления | 190 / 210 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-MK-001 | partner · Доставка в #235 | 211 / 227 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-TX-001 | partner · Новый трансфер | 212 / 228 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-TX-002 | partner · Трансфер TX-809 | 213 / 229 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-CR-001 | partner · Проверка водителя | 214 / 230 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-CR-002 | partner · Выдача CR-601 | 215 / 231 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-CR-003 | partner · Приём автомобиля | 216 / 232 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-EX-001 | partner · Мои группы | 217 / 233 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-EX-002 | partner · Участники экскурсии | 218 / 234 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-TK-001 | partner · Заявка на выписку | 219 / 235 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-TK-002 | partner · Выписка и изменения | 220 / 236 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-GN-001 | partner · Входящие заказы | 221 / 237 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-GN-002 | partner · Принять заказ | 222 / 238 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-GN-003 | partner · Исполнение заказа | 223 / 239 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-GN-004 | partner · Акты и выплаты | 224 / 240 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-GN-005 | partner · Календарь партнёра | 225 / 241 | pending | Нет | Runtime + права/состояния + visual parity |
| SP-GN-006 | partner · Портал партнёра | 226 / 242 | pending | Нет | Runtime + права/состояния + visual parity |
| SH-GN-001 | host · Услуги объекта | 243 / 247 | pending | Нет | Runtime + права/состояния + visual parity |
| SH-GN-002 | host · Цена и комиссия | 244 / 248 | pending | Нет | Runtime + права/состояния + visual parity |
| SH-GN-003 | host · Заказы гостей | 245 / 249 | pending | Нет | Runtime + права/состояния + visual parity |
| SH-GN-004 | host · Доход от услуг | 246 / 250 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-001 | admin · Название услуги | 251 / 266 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-002 | admin · Поля формы | 252 / 267 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-003 | admin · Правила цены | 253 / 268 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-004 | admin · Доступность услуги | 254 / 269 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-005 | admin · Способ исполнения | 255 / 270 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-006 | admin · Сроки по этапам | 256 / 271 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-007 | admin · Кому направить заказ? | 257 / 272 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-008 | admin · Уведомления | 258 / 273 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-009 | admin · Предпросмотр услуги | 259 / 274 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-010 | admin · Матрица SLA | 260 / 275 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-011 | admin · Шаблоны сообщений | 261 / 276 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-012 | admin · Правила объекта | 262 / 277 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-013 | admin · Справочники и права | 263 / 278 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-014 | admin · Партнёры и зарплата | 264 / 279 | pending | Нет | Runtime + права/состояния + visual parity |
| SA-GN-015 | admin · Журнал интеграций | 265 / 280 | pending | Нет | Runtime + права/состояния + visual parity |

## Wave 1 independent browser candidate evidence (2026-10-25)

New portable Chromium proofs use synthetic HTTP fixtures only; they cannot establish actual Core authorization, transaction, or race correctness. They accept `VIEWS_JOURNEY_DIST` and Chromium's `VIEWS_BROWSER_EXECUTABLE`; owner recovery also accepts `VIEWS_JOURNEY_SOURCE` for candidate translations. Run against a normal build, because review builds deliberately isolate Core routes.

- `node scripts/service-queue.browser.cjs`: Q1 runtime candidate corresponding to `0ebe95a6dc3129d124afa335a6a04d6dd7f3f919`. EN/RU/UZ; four services, independent pagination preserving other sections, summary open/close, delayed response invalidated by closing, forbidden/disabled source states, 503/offline clearing and manual recovery, 401 clearing, 360/768/1440 widths and both themes. No HTTP mutations, external requests, or page errors.
- `node scripts/owner-calendar-recovery.browser.cjs`: H1 runtime candidate corresponding to `35262a80827571d0168836d8734cae33965e11bc`. EN/RU/UZ; journal exists before dispatch; lost block and unblock responses survive reload; retries preserve exact key/body and add `recoveryOnly:true`; 403 and ordinary 409 retain unknown state; date/Back locks; validated receipt clears journal even when subsequent refresh fails; invalid dates dispatch nothing; IndexedDB quota prevents dispatch; changing authoritative scope does not expose or delete the old intent; corrupt bytes remain and prevent creation. Three widths and both themes; zero external requests/page errors.
- `node scripts/owner-calendar.browser.cjs`: existing regression adapted to authoritative recovery scope and validated receipt contract. An ordinary conflict now remains locked until recovery confirms absence; this preserves the new safety rule rather than restoring the old unsafe reset. Existing date-range/read recovery, three languages/four widths, removal confirmation, manual-only removal and lost-response assertions remain.

Candidate dist metadata truthfully reports dirty baseline `20decdfff77b2fb59e73496e6e374d1e42e7638b`, since workers built before committing. Runtime-to-commit correspondence above is worker-confirmed; final integrated clean-SHA build, CI, remote release, and APK must be independently rerun by the release owner. These runs do **not** mark any of the 140 screens accepted and do not constitute visual pixel comparison to Canva WebPs.

Remaining independent evidence gaps: H1 true two-page simultaneous claim and lost-origin/Core tombstone races require transaction/backend proofs; Q1 actual actor permission/session revocation and source paging require real disposable Core tests; Android lifecycle/update and queue/calendar smoke await the final integrated APK. M1 private cancellation has no new user-facing screen; its Core test evidence belongs to the Core worker. No live database was used by these browser proofs.

## Обновление 0.22

Начальные 56/84 выше — исторический baseline0.20. После ограниченных H2/A1 реестр содержит 61partial/79pending,0fullyaccepted. По-ID визуальная приёмка не повышена. 0.21 завершена af65312; кандидат 0.22 ещё ждёт итоговыхCI/Android. Семь иллюстративных фото проверены в 0.21, точныеSKU/вода открыты. ДевятьID отдельно исследованы в NINE_SCREEN_VISUAL_AUDIT_20261025.md;84layout-проверки безoverflow неравныvisualparity.
