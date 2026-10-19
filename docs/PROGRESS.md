# VIEWS — текущая точка продолжения

## 2026-10-19 — Срез44: претензия V Market из общей карточки
- GuestMarketReport: описание3–1000, явная отправка для handed_over/completed без open issue; checkout допустим.
- Проверяются ID/revision, неизменные стадия/деньги, точный текст открытой претензии без прежнего ответа.
- Pending сохраняет ключ/тело; offline и навигация блокируются; открытая претензия скрывает report/receipt.
- RED helper/component отсутствовали/0tests; GREEN41новый тест, web983/91files PASS; SQL0126/API прежние.
- Dirtydc7d8e0: web/APIbuild/typecheck, Core66/6files, network187/mail15/126checksum PASS.
- Полная HTTP/browser цепочка:24proofs PASS, exit0.
- Новый Core/browser proof: lost reply, same-key replay, одна issue/audit/outbox, неизменные заказ/фолио/остатки.
- 6снимков RU/UZ/EN×Light/Dark×390; RU Light/Dark иUZ Dark просмотрены.
- Команды/риски: MARKET_DETAIL_ISSUE_44.md; public032ea93/Cloudflare/APK и Canva56partial/84pending прежние.
- Hard reload recovery остаётся. Далее: аудит авторизации ответа склада answer_issue.

## 2026-10-19 — Срез43: авторизация претензии V Market
- Перед UI воспроизведены early cached replay и logout во время ожидания профиля вreport_issue.
- SQL0126 выделяет гостевую команду; владение/сессия проверяются после locks до replay, private ACL закрыт.
- Fresh/cached logout/unlink/reassign не меняют заказы, склад, фолио, audit/outbox; доступный повтор создаёт одну претензию.
- RED7failed/5passed (6гонок+отсутствующая функция); GREEN12целевых, Core265/25files PASS.
- Dirty5236520: web942/90files, web/APIbuild/typecheck, network187/mail15/126checksum PASS; старые125checksum прежние.
- Полная цепочка:36подготовительных Core и23HTTP/browser proofs PASS, exit0.
- Подробности/команды/риски: MARKET_ISSUE_AUTHORIZATION_43.md; только disposable PostgreSQL16/loopback SMTP.
- Guest UI, staff answer_issue и прочие market-команды не меняются; public032ea93/Cloudflare/APK/Canva прежние.
- Далее: форма гостевой претензии V Market из общей карточки с неизменным retry и проверкой квитанции.

## 2026-10-19 — Срез42: получение V Market из общей карточки
- Добавлена явная форма согласия для handed_over без open issue; completed/прочие стадии скрывают действие.
- Контракт проверяет ID/revision, точные сумму/валюту, завершение и состав ответа; ошибочный ответ сохраняет pending.
- Повтор использует исходный ключ/тело; навигация блокируется, offline запрещает отправку. Checkout допустим по Core.
- RED: helper отсутствовал/0tests; GREEN37новых, web942/90files PASS; SQL0125/API/зависимости прежние.
- Dirty56375a5: web/APIbuild/typecheck PASS; Core71/6files; network187/mail15/125checksum PASS.
- Полная HTTP/browser цепочка:23proofs PASS, exit0.
- Новый браузерный proof: consent, lost reply/replay, offline, одна charge/audit/outbox;6снимков RU/UZ/EN×темы×390.
- RU Light/Dark иUZ Dark просмотрены; детали/команды/риски: MARKET_DETAIL_RECEIPT_42.md.
- Public032ea93/Cloudflare/APK и Canva56partial/84pending прежние; hard reload recovery остаётся.
- Далее: претензия V Market из общей карточки после аудита авторизации этой команды.

## 2026-10-19 — Срез41: авторизация получения V Market
- До UI выявлен cached replay до проверки актуальных прав и logout во время ожидания начисления.
- SQL0125 выделяет гостевой confirm_receipt; повтор проверяет владельца/сессию после locks, поздний отказ откатывает начисление.
- Суммы bigint, единственное начисление, audit/outbox, прежний payload и остальные dispatch сохранены; private ACL закрыт.
- RED8failed/8passed на прежнемSQL; GREEN17целевых, Core253/24files PASS на dirty3b34808.
- Web905/89files, web/APIbuild/typecheck, network187/mail15/125checksum PASS; прежние124checksum сохранены.
- Сквозная цепочка:24подготовительных Core и22HTTP/browser proofs PASS, exit0.
- Критерии, команды и риски: MARKET_RECEIPT_AUTHORIZATION_41.md; только disposable PostgreSQL16/loopback SMTP.
- Public032ea93/Cloudflare/APK и Canva56partial/84pending прежние; остальные команды требуют отдельного аудита.
- Далее: подтверждение получения V Market из общей карточки; UI перенесён ради предварительного исправления прав.

## 2026-10-19 — Срез40: закрытие претензии из общей карточки
- Open/answered: отдельные checkbox/отправка; лимит8 и checkout не мешают закрытию; resolved скрывает форму.
- Проверяются ID/revision, неизменные стадия/деньги, бирка/тип и последняя запись истории; pending сохраняет ключ/тело.
- RED unit: helper отсутствовал/0tests; GREEN42. Девять новых resolve race/replay сценариев,37focusedCore PASS.
- Dirty1ee1c6d: web905/89files, Core236/23files, обе сборки/typecheck, network187/mail15/124checksum PASS.
- Финальная браузерная цепочка exit0:12подготовительных Core и22HTTP/browser proofs PASS; history8→9, деньги/заказ прежние.
- 6снимков RU/UZ/EN×Light/Dark×390; RU Light/Dark иUZ Dark просмотрены. SQL0124/API/права/зависимости прежние.
- Критерии/запуск/риски: LAUNDRY_DETAIL_RESOLVE_40.md; только disposable БД/loopback SMTP.
- Public032ea93/Cloudflare/APK, Canva56partial/84pending прежние; hard reload recovery остаётся.
- Далее: получение V Market из общей карточки с предварительной проверкой прав и повторов.

## 2026-10-19 — Срез39: претензия прачечной из общей карточки
- Бирка/тип/описание, явная отправка; accepted→closed, после checkout; open claim/лимит истории скрывают форму.
- Квитанция проверяет ID/revision/стадию/точные деньги и последнее обращение; pending хранит прежние ключ/тело вне карточки.
- SQL0124 уже проверяет доступ после locks;9новых report_claim race/replay тестов, всего28focused PASS.
- RED unit: helper отсутствовал/0tests; GREEN97новых. Dirty91dbfe3: web863/88files, обе сборки/typecheck PASS.
- Core227/23files PASS; исправлен неоднозначный locator описи старого receipt proof; focused12Core/9proofs PASS.
- Финальная полная браузерная цепочка exit0:12подготовительных Core и21HTTP/browser proof PASS; новый claim не меняет деньги.
- Network187/mail15/124checksum PASS;6снимков, RU Light/Dark иUZ Dark визуально проверены; independent review PASS.
- Запуск/критерии/ручная приёмка: LAUNDRY_DETAIL_CLAIM_39.md; только disposable БД/loopback SMTP.
- Resolve из общей карточки и hard reload recovery остаются; public032ea93/Cloudflare/APK, Canva56partial/84pending прежние.
- Далее: явное закрытие претензии из общей карточки отдельно от получения и начисления.

## 2026-10-18 — Срез38: получение прачечной из общей карточки
- Delivered: опись/сумма/валюта, checkbox и явное получение с начислением в фолио; после checkout доступно.
- Open/answered claim скрывает действие; новая претензия после согласия даёт409 без начисления.
- Expected сумма/валюта остаются в Attempt вне body; closed receipt проверяется строго, включая bigint и claim.
- Pending вне карточки сохраняет ключ/тело при lost/invalid ответе; offline/переходы/выход защищены.
- RED: helper отсутствовал/0tests; старая сборка остановилась на отсутствующей форме. Новые75unit PASS.
- Dirty2a14153: web766/87files, обе сборки/typecheck, network187/mail15,124checksum PASS.
- Финальный связанный прогон exit0:218Core/23files и20HTTP/browser proofs PASS, включая новое получение из карточки.
- Gateway скрывал FOLIO_NOT_OPEN как uncertain: RED1failed/8passed, теперь известный отказ409 передаётся, неизвестные скрыты.
- Proof: точные ID/пагинация cleaning, счётчик receipt и паузы laundry в пределах лимита;6снимков, RU Light/Dark иUZ Dark reviewed PASS.
- SQL0124/маршруты/body/права/зависимости прежние; запуск/ручная приёмка: LAUNDRY_DETAIL_RECEIPT_38.md.
- Только disposable БД/loopback SMTP; hard reload recovery остаётся. Public web032ea93/Cloudflare/APK прежние.
- Canva56partial/84pending без изменения статусов; далее претензии к прачечной из общей карточки.

## 2026-10-18 — Срез37: авторизация получения прачечной после ожидания
- Миграция0124: сессия проверяется после profile lock, folio lock/insert и позднего order UPDATE.
- Cached receipt не выдаётся после logout; свежая команда откатывает начисление и статусы целиком.
- RED на123миграциях:3failed/16passed; GREEN:19passed, шесть новых реальных гонок/контролей.
- Runtime views_app без super/BYPASSRLS; pg_locks+blocking PID, exact bigint, одна запись и повтор без дублей.
- Dirty d2c0be5: web689/86files, API/web build/typecheck, network187/mail15,124checksum PASS.
- Полный связанный прогон exit0: Core218/23files и19HTTP/browser proofs PASS.
- SQL/ACL/тесты reviewed PASS; прежние123миграции неизменны, API/права/порядок locks/зависимости прежние.
- Гарантия ограничена проверенными ожиданиями при READ COMMITTED; отдельные гонки претензий не приняты.
- Только disposable БД/loopback SMTP; запуск/критерии/ручные проверки: LAUNDRY_RECEIPT_AUTHORIZATION_37.md.
- Public web032ea93/Cloudflare/APK и Canva56partial/84pending без изменений; UI в этом срезе не расширяется.
- Далее: получение вещей с явным подтверждением начисления из общей карточки и защита неизвестного ответа.

## 2026-10-18 — Срез36: отказ от описи из общей карточки
- Quoted: review/checkbox/явная отправка; владелец может запросить возврат без обработки и после выезда.
- Awaiting_return сохраняет ответственность за вещи; только staff return_unprocessed фиксирует передачу, без заказа/начисления.
- ID/revision/строгая квитанция; pending вне карточки, тот же ключ/тело при потере ответа, offline/переходы/выход защищены.
- RED: missing helper0tests и старая сборка без кнопки; gateway regression1failed/47passed, теперь48новых unit PASS.
- Gateway опускает claim:null; helper совместим с null/отсутствием, остальные значения отклоняет; API прежний.
- Dirty f68527f: web689/86files, Core212/23files, обе сборки/typecheck, network187/mail15,123checksum PASS.
- Первый full остановился на staff-пагинации; тест теперь связывает каждый GET с HTTP200 и конкретными DOM-карточками.
- Первый focused обнаружил несовпадение claim; финальный full exit0:212Core и19HTTP/browser proofs PASS.
- Held/lost/invalid/replay: один reject audit/outbox,orders/folio0; same-price requote409/manualGET сбрасывает review.
- Concurrent reject после checkout и cached receipt после staff-return проверены; RU/UZ/EN×Light/Dark×390px, снимки/review PASS.
- API/SQL0123/права/зависимости прежние; только disposable БД/loopback SMTP; LAUNDRY_DETAIL_REJECTION_36.md.
- Hard reload recovery, claims/folio wait остаются; public web032ea93/Cloudflare/APK и Canva56/84 без изменений.
- Далее: проверить авторизацию confirm_receipt после ожидания блокировки фолио, затем добавить получение/начисление в карточку.

## 2026-10-18 — Срез35: согласование прачечной из общей карточки
- Quoted + действующий заезд: опись/итог/срок, явный checkbox; requestSubmit без согласия не отправляет POST.
- Команда связывает ID/revision/точный bigint; квитанция проверяет accepted/orderId/следующую revision и опись.
- Pending вне карточки сохраняет ключ/тело при потере/повреждении ответа; offline/переходы/выход защищены.
- RED: helper отсутствовал,0собранных unit; старый dist упал на отсутствующей кнопке. Новые48unit PASS.
- Dirty fca3a81: web641/85files, Core211/23files, обе сборки/typecheck, network187/mail15,123checksum PASS.
- Полный Core/browser exit0:18структурированных proofs; runtime views_app, реальные staff receive/quote.
- Held200→lost→malformed replay→valid replay: один заказ/audit/outbox, ноль folio; точная сумма больше2^53.
- Requote409/manualGET сбрасывает согласие; Core также проверяет изменённую опись/срок при прежней цене.
- Requested/accepted/checkout без кнопки; RU/UZ/EN×Light/Dark×390px PASS, снимки просмотрены; review PASS.
- API/SQL0123/права/зависимости прежние; запуск/ручная приёмка: LAUNDRY_DETAIL_APPROVAL_35.md.
- Только disposable БД/loopback SMTP; hard reload recovery и claims/folio wait остаются отдельными задачами.
- Public web032ea93/Cloudflare/APK и Canva56partial/84pending без изменений; далее отклонение описи и возврат без обработки из карточки.

## 2026-10-18 — Срез34: отмена прачечной из общей карточки
- Requested + действующий заезд: review/checkbox/явная отправка; received/quoted/выезд — без отмены.
- Проверены intakeId/revision и cancelled-квитанция с null orderId/items/totalMinor; API/SQL0123 прежние.
- Hook хранит ключ/тело вне очищаемой карточки; in-flight/unknown/offline блокируют переходы и выход.
- Unit red10failed/21passed +absent helper; browser старого dist упал на отсутствующей кнопке; новые58targeted PASS.
- Dirty a0bb6e2: web593/84files, Core210/23files, обе сборки/typecheck, network187/mail15,123checksum PASS.
- Первый Core209/210 выявил старый тест first-page UUID; исправлен обход страниц в тесте, код склада прежний.
- Focused browser exit0:13Core/5proofs, requestSubmit без согласия, held200→lost→same-key, audit/outbox1,orders/folio0.
- Stale409 без autoresend, received/quoted/checkout, unlink→cached404/очистка; RU/UZ/EN,Light/Dark,390px PASS.
- Full browser exit0:17proofs, все4услуги/карточки/входы/фолио/склад PASS; снимки тем просмотрены; review PASS.
- Новых миграций/прав/зависимостей нет; только disposable PostgreSQL/loopback SMTP; LAUNDRY_DETAIL_CANCELLATION_34.md.
- Hard reload recovery и claims/folio wait остаются; public web032ea93/Cloudflare/APK и Canva56/84 без изменений.
- Далее: согласование описи и итоговой цены прачечной из общей карточки заказа.

## 2026-10-18 — Срез33: доступ при повторе команды прачечной
- Migration0123: fulfilment replay после прежних locks и текущей авторизации; guest_user после profile FOR SHARE.
- Сигнатуры/API/ACL/стадии/деньги сохранены;122 прежних миграций/checksum не изменены,123checksum PASS.
- Red7failed/6passed из13: cached guest/staff logout, unlink/reassign, обход row wait, fresh logout при profile wait.
- Green на dirty e7ac9f9: Core210/23files, включая13новых; web557/83files, обе сборки/typecheck, network187/mail15 PASS.
- Runtime views_app, реальные pg_locks+blocking PID, bounded waits; отдельная staff-сессия отзывается в finally.
- Отказ/replay сохраняют intake/orders/folio, без новых audit/outbox; историческая квитанция после выезда доступна владельцу.
- Первый full browser: прачечная PASS, затем offline/detail proof race; усилено ожидание offline→online без изменения UI.
- Focused browser exit0: карточки4услуг, отмена уборки, поздний ответ/offline,13подготовительных Core-тестов PASS.
- Full browser повтор exit0:16proofs/16подготовительных Core-тестов, включая прачечную/фолио/склад; review PASS.
- Claims wrapper0101 и поздний folio wait не исправлены; прямой intake-row/staff scope revoke не проверены отдельно.
- Только disposable PostgreSQL/loopback SMTP; запуск/критерии/риски: LAUNDRY_REPLAY_AUTHORIZATION_33.md.
- Public web032ea93/Cloudflare/APK и Canva56partial/84pending без изменений; далее отмена прачечной из общей карточки.

## 2026-10-18 — Срез32: внешняя защита неподтверждённых команд гостя
- GuestTrips сообщает pending услуг/отмены; выход, проверка сессии, preview/accept брони заблокированы.
- Внешний запрос блокирует действия поездки; поздний onLinked обновляет список только после разрешения команд.
- Guard привязан к userId/csrf/tripRevision: старые callbacks/cleanup не очищают новое состояние, rerender сохраняет ключ.
- Реальный401 очищает подходящую сессию; late account replies инвалидируются; initial load ждёт снятия busy.
- Red: прежняя сборка разрешала Sign out при удержанном ответе; новый guard отсутствовал;7unit теперь PASS.
- Dirty4c7fef6: web557/83files, Core197/22files, обе сборки/typecheck, network187/mail15,122checksum PASS.
- Focused browser exit0: held link/session, inflight/unknown/offline, те же ключ/тело, сохранённый draft, logout→retry401.
- Full browser chain exit0:16подготовительных Core-тестов,16proofs;4услуги/отмена/детали/фолио/склад/входы PASS.
- Независимое ревью PASS; StrictMode cleanup проверен анализом, отдельный dev-browser не запускался.
- Новых миграций/прав/зависимостей нет; только disposable БД/loopback SMTP; запуск/риски: GUEST_OUTER_PENDING_GUARD_32.md.
- Public web032ea93/Cloudflare/APK и Canva56partial/84pending без изменений; закрытие/reload требует durable recovery.
- Далее: отмена заявки прачечной из общей карточки с проверкой прав и повтора; аудит прочих команд остаётся.

## 2026-10-18 — Срез31: доступ при повторе отзыва об уборке
- Migration0122: сохранённый ответ после прежних locks и текущей сессии/владельца, до feedback-exists guard.
- Частная оценка услуги, один неизменяемый отзыв; API, ACL, цена, audit/outbox и финансовые правила сохранены.
- Red4failed/6passed: cached logout/unlink/reassign и обход order row wait; все10 новых тестов теперь PASS.
- Runtime views_app, pg_locks+blocking PID, bounded waits; реальные request/assign/start/submit/approve в fixtures.
- Отказ/replay не меняют feedback/order/task/folio/audit/outbox; teardown выключает только свои catalog IDs.
- Dirtya2fe3d3: Core197/22files, web550/82files; web/API typecheck/build, network187/mail15 PASS.
- Focused connected cleaning browser exit0: полный путь уборки, lost feedback reply/same-key, одно начисление.
- RU/UZ/EN, Light/Dark/mobile/offline и checkout history PASS; полная browser chain не повторялась.
- Добавлен focused flag к существующему runner; 122checksum PASS, старые121миграций неизменны; review PASS.
- Критерии/запуск/границы READ COMMITTED: CLEANING_FEEDBACK_REPLAY_AUTHORIZATION_31.md; новых прав/зависимостей нет.
- Только disposable БД/loopback SMTP; public web032ea93/Cloudflare/APK и Canva56partial/84pending без изменений.
- Далее: pending guard внешних logout/session refresh/привязки брони; остальные команды услуг требуют аудита.

## 2026-10-18 — Срез30: доступ при создании и повторе уборки
- Migration0121: replay после блокировок брони/профиля и актуального доступа, до проверки текущей цены/стадии.
- Новая команда повторно проверяет сессию после catalog FOR SHARE; цена/начисления/ACL сохранены.
- Red:5failed/7passed из12 — cached logout/unlink/reassign, обход row wait, создание после logout при catalog wait.
- Green:12новых проверок с views_app, pg_locks+blocking PID, ограниченными таймаутами и scoped snapshots.
- Dirty9bbc8fd: Core187/21files, web550/82files; web/API typecheck/build, network187/mail15 PASS.
- Полная connected browser chain exit0: создание/lost reply/replay/инспекция, отмена из карточки, все4услуги.
- Также прошли детали, фолио, закупки/склад, входы, RU/UZ/EN и mobile/theme сценарии; SMTP только loopback.
- 121checksum PASS; старые120миграций/checksum неизменны; новых таблиц, прав и зависимостей нет.
- Независимое SQL/test review PASS; запуск, критерии и границы READ COMMITTED: CLEANING_REQUEST_REPLAY_AUTHORIZATION_30.md.
- Public web032ea93/Cloudflare/APK и Canva56partial/84pending не менялись; только disposable PostgreSQL.
- Далее: аналогичная проверка guest_service_feedback SQL0074; внешние pending guards и остальные экраны открыты.

## 2026-10-18 — Срез29: повторная авторизация отмены и переноса уборки
- Migration0120: сохранённый ответ возвращается после прежних row locks и актуальной сессии/владельца.
- Проверки revision/stage остаются после replay; разрешённый повтор после изменения стадии/выезда сохранён.
- До исправления9тестов:4cached-replay отказа упали,5прошли; зафиксирован возврат ответа после отзыва доступа.
- Новые10тестов: logout/unlink/смена гостя при advisory wait, logout при row wait, fresh/replay/conflict без записей.
- Runtime views_app без superuser/bypassRLS; pg_locks+blocking PID доказывают ожидание, таймауты ограничены.
- Dirty b7f58e0: Core175/20files, web550/82files; web/API typecheck/build, network187/mail15,120checksum PASS.
- Focused connected browser exit0: прямые детали4услуг и отмена с потерянным ответом, один audit/outbox, folio0.
- Полная browser chain не повторялась: API/экран не менялись; независимое SQL/security review PASS.
- Старые миграции/checksum и права сохранены, новых таблиц/зависимостей нет; только disposable PostgreSQL.
- Критерии/запуск/границы READ COMMITTED: CLEANING_REPLAY_AUTHORIZATION_29.md; ограничение блока28 закрыто для change.
- Public web032ea93/Cloudflare/APK и Canva56 partial/84 pending без изменений; внешние pending guards открыты.
- Далее: аналогичная защита повтора создания уборки SQL0069, затем проверки остальных команд услуг.

## 2026-10-18 — Canva28: отмена уборки из точной карточки
- GuestOrderDetail: явное подтверждение отмены requested/assigned; после выезда только история.
- Использованы API/SQL0073/0119 и useCleaning; команда привязана к ID/revision, ответ строго проверяется.
- Pending хранится вне очищаемой карточки: offline не теряет ключ/тело, переходы/refresh блокируются.
- Неизвестный результат — ручной повтор той же команды; stale conflict очищает карточку до ручного GET.
- Red: отсутствующий helper/непроверенная revision; browser старой сборки упал на отсутствующей отмене.
- Dirty7b5867c: web550/82files, Core165/19files; web/API typecheck/build, network187/mail15,119checksum PASS.
- Полная connected browser chain exit0: lost response → same-key/body replay → один audit/outbox, folio0.
- Проверены stale409 без autoresend, checked_out без действий, RU/UZ/EN×Light/Dark×390px; lifecycle7reads PASS.
- Независимое ревью PASS; новых миграций/зависимостей/прав нет, только disposable PostgreSQL.
- Критерии/запуск/риски: design/CANVA_140_BLOCK_28_DETAIL_CANCELLATION.md; реестр56 partial/84 pending.
- Public web032ea93/Cloudflare/APK без изменений. Внешние logout/booking-link pending guards остаются открыты.
- Далее: перепроверка доступа после ожидания cached replay SQL0073; затем команды других услуг из деталей.

## 2026-10-18 — Canva27: прямые детали заказа по ID
- Migration0119/API/gateway: один scoped GET для cleaning/laundry/market/concierge, laundry по intakeId.
- Сессия, текущий владелец, организация/объект проверяются в БД; чужой/неверный/отсутствующий ID дают404.
- UI больше не использует cursor для деталей; строгий single-item ответ, offline/revocation/late-response guards сохранены.
- Whitelist скрывает stock IDs/служебные заметки; история после выезда, без новых начислений и событий.
- Red: отсутствующая SQL-функция и прежний UI маршрут; review выявил normalized-URL market gate bypass, исправлен.
- Изолированы три synthetic товара: первый общий browser run упал в market; после teardown полный повтор exit0.
- Dirty a09bffe: web520/81files, Core165/19files; web/API typecheck/build, network187/mail15,119checksum PASS.
- Full connected browser chain PASS:4прямых GET,2-я страница безcursor, строгие query/method, RU/UZ/EN×Light/Dark×390px.
- Lifecycle7reads PASS:stale cursor/StrictMode/target/unmount; независимое ревью PASS; synthetic seed8replays PASS.
- Критерии/запуск/риски: design/CANVA_140_BLOCK_27_DIRECT_ORDER.md; новых зависимостей/таблиц/индексов нет.
- Только disposable PostgreSQL, внешние операции отключены; SG-GN-006/007 partial, общий реестр56/84.
- Public web032ea93/Cloudflare/APK без изменений. Далее: действия внутри карточки, затем серверный поиск истории.

## 2026-10-18 — Canva26: параллельные детали четырёх услуг
- Все140 ID включены в CANVA_140_PARALLEL_QUEUE.md;280 WebP checksum/decode/размеры PASS, исходный PDF сейчас отсутствует.
- Четыре агента сделали read-only карточки уборки/прачечной/V Market/консьержа; отдельные inventory/browser/review, root объединил.
- Конкретный заказ перечитывается одним scoped GET по source cursor; нет подмены соседним ID или автоматических команд.
- Whitelist, bigint, опись/претензии/кредиты/переписка/SLA; служебные заметки и бюджет консьержа не раскрываются.
- Offline/ошибка/отзыв доступа очищают детали; сохранены черновики и ручной retry; действия остаются в направлениях.
- Red unit: новые модули отсутствовали; review нашёл StrictMode busy-lock, исправлено; dev browser red/green подтвердил.
- Dirty f9e655b: web499/81files, Core161/18files; web/API typecheck/build, network187/mail15,118 checksum PASS.
- Полная connected browser chain exit0:4точных заказа,2-я страница,1GET, RU/UZ/EN×Light/Dark×390px, без новых начислений.
- Lifecycle browser PASS:StrictMode, смена target/unmount и поздний ответ; mobile screenshots просмотрены.
- Миграций/зависимостей/прав не добавлено; disposable PostgreSQL, реальные внешние операции отключены.
- Критерии/запуск/риски: design/CANVA_140_BLOCK_26_ORDER_DETAILS.md; SG-GN-006/007 partial, реестр56/84 без повышения.
- Public web032ea93/Cloudflare/APK без изменений. Далее: read-by-ID/действия заказа и независимые пакеты полной очереди.

## 2026-10-18 — Canva25: общий список заказов поездки
- GuestOrderList: четыре направления, явная загрузка, фильтры статуса/услуги, независимая догрузка страниц.
- Фильтры относятся только к загруженным страницам; UUID-порядок не выдаётся за хронологию.
- Bigint без потери точности; исходная сумма/оценка/расчёт отделены от оплаты и возврата; бюджет консьержа скрыт.
- Ошибка очищает весь список; offline и смена контекста отсекают поздние ответы, отзыв доступа очищает карточки.
- Red unit: отсутствующий модуль; исправлены ограничения synthetic SKU/переходов и независимость laundry HTTP fixture.
- Dirty e8c4466: web408/76files, Core161/18files PASS; web/API typecheck/build, network187/mail15,118 checksum PASS.
- Финальная полная connected browser chain PASS, exit0: четыре API, страницы, фильтры, offline/retry/revocation, read-only.
- RU/UZ/EN, Light/Dark,390px и скриншоты проверены; независимый review PASS.
- Существующая схема/API, новых миграций/зависимостей/прав нет; использована только disposable PostgreSQL.
- Критерии/запуск/риски/ручная проверка: design/CANVA_140_BLOCK_25_ORDER_LIST.md.
- SG-GN-006 partial; реестр56 partial/84 pending. Public web032ea93, Cloudflare и APK без изменений.
- Далее: переход к конкретному заказу из списка; серверный поиск и общий pending guard внешнего выхода отдельно.

## 2026-10-18 — Canva24: направления услуг в поездке
- GuestTripServices: уборка, прачечная, консьерж, V Market открываются отдельно; ленивый mount, черновики в памяти.
- Неизвестный результат блокирует переходы внутри поездки; прежний idempotency-key сохраняется при retry.
- RU/UZ/EN, Light/Dark, клавиатура/возврат фокуса, история после выезда; смена брони/сессии очищает панели.
- Guard позднего отказа авторизации сверяет userId+csrf и не закрывает новую сессию; независимый review PASS.
- Red: старый dist не содержит навигацию; отдельный red guard — отсутствующий модуль. Исправлен перенос названия в390px.
- Dirty814ab12: web388/75files, Core161/18files PASS; web/API typecheck/build, network187/mail15,118 checksum PASS.
- Финальная connected browser chain PASS, exit0: четыре услуги, drafts/retry/checkout/other-trip, mobile и две темы.
- Схема/API действующие; миграций/зависимостей/прав не добавлено. Среда готова, перенастройка не требовалась.
- Запуск/критерии/ручная проверка/риски: design/CANVA_140_BLOCK_24_GUEST_SERVICE_NAV.md.
- SG-GN-006 остаётся partial; общий реестр56 partial/84 pending, полной приёмки нет. Public web032ea93/APK без изменений.
- Далее: общий список заказов с фильтрами; общий guard внешнего выхода/привязки брони при pending — отдельно.


## 2026-10-17 — L4b: приватная команда резерва и освобождения
- Migration0118: reserve_lots/release_lots, строгий контракт, сессия + stock.manage + scope, ревизия заказа.
- Блокировки ключ→заезд→заказ→товары; повторная авторизация после ожидания, включая cached replay.
- Все позиции атомарно, количество из БД; повтор ключа без дублей, изменённое тело конфликтует.
- Ревизия/команда/audit/outbox фиксируются вместе; освобождение после окончания проживания допустимо.
- Новая команда закрыта в service_private; runtime-grant/API/UI отсутствуют до всех путей освобождения.
- Независимый review + новый proof: отзыв сессии во время lock wait, multi-line rollback, scope, replay, аудит PASS.
- Red: отсутствующая функция; исправлен CASE-синтаксис новой миграции до финального прогона.
- Dirty3b5aa89: Core161/web385 PASS; API/web typecheck/build, network187/mail15,118 checksum/diff check PASS.
- PostgreSQL disposable, оба административных proof PASS, exit0; browser не запускался — UI не менялся.
- Запуск/ручная проверка/риски: MARKET_LOT_COMMAND_L4B.md; новых зависимостей и runtime-прав нет.
- Далее: атомарное освобождение при отмене/замене/выдаче, затем API/UI. Public web032ea93/APK без изменений.


## 2026-10-17 — обновлён публичный веб по запросу владельца
- GitHub Pages опубликован из 032ea93449ecd25f6ddf80039cb3ecf0ee9045cc, версия 0.15.0-preview.
- Workflow pages.yml dispatch: run39027334890 success; 385 тестов и build:pages PASS.
- https://masurovadasha-cmyk.github.io/views-hotel-platform/
- public-release.browser.cjs PASS: чистый source SHA, 9 скачанных ресурсов с TLS, входы по ролям, V Market, Canva Light/Dark.
- Это static-demo: Core/email/реальные заказы отключены; резерв партий не активирован.
- Cloudflare и APK не обновлялись. Следующий программный срез остаётся командой резерва с идемпотентностью/audit.


## 2026-10-14 — L4a: фундамент резерва по партиям
- Migration0117: FK заказа/позиции/товара/ledger, один активный резерв позиции, индексы, scoped RLS.
- Текущая версия и годность при создании; общий item lock не допускает двойного занятия партии.
- Движения/сверка сохраняют покрытие резервов; терминальный статус требует освобождения.
- Runtime-запись запрещена до чтения данных; API/экран/активация отсутствуют намеренно.
- Административный proof с двумя соединениями: гонка, stale/unknown/expiry/quantity, rollback, RLS PASS.
- Red: отсутствующая таблица; исправлены fixture типы/гость/контекст/транзакция и порядок отказа RLS.
- Dirty54faa4f: web385/Core161 PASS, обе сборки/typecheck, network187/mail15,117 checksum/diff check PASS.
- Только disposable PostgreSQL16; persistent views_local не изменялась. Browser не запускался: UI не менялся.
- Запуск/риски/ручная проверка: MARKET_LOT_RESERVE_L4A.md; новых зависимостей и runtime-прав нет.
- Далее: аутентифицированная команда резерва с идемпотентностью/audit/outbox и подключение всех путей освобождения.
- Общий SKU-резерв, публичные веб/APK и Canva56 partial/84 pending без изменений.


## 2026-10-14 — L3b: годные партии перед резервированием
- Staff API обоих режимов выдачи исключает нулевые и просроченные партии по дате объекта.
- Ближайший срок первым, маркировка разрешает равные даты; неизвестный срок последним, только ручная проверка.
- UI RU/UZ/EN объясняет порядок, автоматического выбора нет; общий SKU-резерв/цены не менялись.
- Использован helper0114; новых миграций, зависимостей и прав нет. Среда не требовала перенастройки.
- Red1 failed/23 passed после исправления формы неизвестной партии в fixture.
- Dirtyec33a6d: web385/Core161 PASS; API/web build/typecheck, network187/mail15,116 checksum/diff check PASS.
- Полная connected browser chain PASS, exit0; подсказка и отсутствие автоподбора проверены в браузере.
- Запуск/ручная проверка/ограничения: MARKET_LOT_ELIGIBILITY_L3B.md.
- Полный резерв больше среза: далее схема привязки партии и инварианты конкуренции, затем все команды до включения.
- Резерв пока по SKU; FEFO-автовыбор не включён. Public web/APK и Canva56 partial/84 pending без изменений.


## 2026-10-14 — L2f.3: актуальные партии в выдаче V Market
- Staff API отдаёт текущие reconciled версии ledger; гостевой API их не раскрывает.
- Форма RU/UZ/EN передаёт movementId для каждой позиции; обновление партий сбрасывает выбор и подтверждение.
- Устаревшая позиция откатывает всю выдачу; конкурентный replay не дублирует списание, цена сохранена.
- Используются guards0116: новых миграций, зависимостей и прав нет.
- Red:1 failed/22 passed; dirty3973ded web385/Core160 PASS, API/web typecheck/build PASS.
- Network187/mail15,116 checksum/diff check PASS. Полная connected browser chain PASS, exit0.
- Первый browser прогон выявил ошибку порядка подготовки нового теста; исправлена, повтор полностью зелёный.
- Запуск, критерии, ручная проверка и риски: MARKET_CURRENT_LOTS_L2F3.md.
- Далее: резервирование по партиям и FEFO; одна партия на позицию, выбор вручную. Весь маркет ещё открыт.
- Public web/APK и Canva56 partial/84 pending без изменений.

## 2026-10-14 — L2f.2: версии распределения и актуальная ручная выдача
- Migration0116: immutable заголовок каждого нового движения и нормализованные строки quantity_after; сумма равна SKU.
- Журнал фиксирует reconciled/recount_required/not_initialized; RLS и запрет runtime-записи, без исторического backfill.
- Optional movementId связывает выдачу с текущей версией под item lock; количество проверяется по строкам журнала.
- Форма RU/UZ/EN включает ручной выбор текущего остатка; старый контракт свежей сверки сохранён.
- Гонка одной версии даёт одного победителя; replay без дубля; новая версия позволяет продолжить выдачу без пересчёта.
- Red1 failed/15 passed; исправлена CASE-синтаксическая ошибка новой миграции до применения.
- Dirtybe17882: web385/Core159 PASS; API/web typecheck/build, network187/mail15,116 checksum/diff check PASS.
- Targeted connected supply browser PASS, exit0: выдача по текущему журналу после устаревания снимка; общая guest chain не запускалась.
- Запуск/ручная проверка/риски: SUPPLY_LOT_LEDGER_L2F2.md. Новых зависимостей и прав нет.
- Далее: текущие версии в выдаче V Market. FEFO/резерв партий/многопартийность открыты; public web/APK без изменений.

## 2026-10-14 — L2f.1: проверочный расчёт остатков партий
- Migration0115: read-only projection от новой физической сверки; scoped RLS, общий item lock и атомарное обновление.
- Приход/подтверждённая выдача/связанный возврат пересчитывают партии; сумма равна SKU, неизвестное происхождение явно null/null.
- Нераспределённая выдача/корректировка скрывает lots до новой сверки; последующий приход не восстанавливает разбивку предположительно.
- API/экран RU/UZ/EN показывают статус и расчёт; frontend отвергает несовпадающие суммы.
- Red: Core1 failed/14 passed, UI1 failed/11 passed. Dirty77ae465: web385/Core158 PASS; API/web build/typecheck PASS.
- Network187/mail15,115 checksum и diff check PASS; targeted connected supply browser PASS, exit0.
- Проверены конкурентные поступления, replay, откат после обновления projection, RLS, ручной issue и market return.
- Запуск/ручная проверка/риски: SUPPLY_LOT_PROJECTION_L2F1.md. Новых зависимостей и прав нет.
- Это проверочный read model, не операционный ledger; выдача всё ещё требует свежей сверки, резерв/FEFO не включены.
- Далее L2f.2: операционный ledger и выбор по актуальному revision. Canva56 partial/84 pending; public web/APK без изменений.

## 2026-10-14 — L2e / L3a: история возврата и годность
- История склада показывает подтверждённую партию возврата/исходную выдачу; unknown/legacy не переименованы в известные.
- Frontend проверяет структуру provenance и запрещает её на issue; scoped read/RLS сохранены.
- Владелец согласовал конец дня объекта и ручную проверку неизвестного срока; решение записано в DECISIONS.md.
- Migration0114: helper календарной даты + guard выбранной партии при issue/return; откат не меняет остаток/revision.
- Red: UI1 failed/10 passed, Core1 failed/13 passed; dirty688d03f web384/Core157 PASS, web/API build, network187/mail15 PASS.
- Connected browser chain PASS, exit0: выдача/возврат и отображение исходной партии в истории;114 checksum/diff check PASS.
- Запуск/ручная проверка: MARKET_LOT_HISTORY_EXPIRY.md; полный остаток задач: MARKET_REMAINING.md.
- Следующий блок L2f: живые остатки всех движений; затем FEFO/резервы, фото и переданные заказы. Весь маркет ещё открыт.
- Canva56 partial/84 pending; public web/APK без обновления. Новых зависимостей/прав нет.

## 2026-10-14 — L2d: возврат в партию исходной выдачи
- Migration0113: immutable return_source_issue_id FK и guard заказа/товара/организации/объекта.
- Инспекция RU/UZ/EN показывает исходную партию; сотрудник явно подтверждает совпадение маркировки.
- Сервер определяет источник; без записанной партии привязка запрещена. Обычный возврат без партии сохранён.
- Повтор команды не дублирует остаток; ошибочная привязка сохраняет карантин; гостевой счёт не меняется.
- Red:1 failed/6 passed; на dirty370b86b web383/Core156, web/API build/typecheck, network187/mail15,113 checksum PASS.
- Connected browser chain PASS, exit0: инспекция, явное совпадение маркировки, связь движений в PostgreSQL.
- Запуск и ручная проверка: MARKET_RETURN_LOT_L2D.md. Новых зависимостей и прав нет.
- Ссылка фиксирует происхождение, не живой остаток; FEFO и многопартийные движения остаются отдельными срезами.
- Далее: отображение происхождения возврата в складской истории. Canva56 partial/84 pending; public web/APK без обновления.

## 2026-10-14 — L2c: выдача V Market из сверенных партий
- Migration0112: полный выбор по строкам замороженного заказа, проверка свежести/количества guard0111, атомарная выдача.
- API и форма RU/UZ/EN: по одной партии на позицию; гостевой API партии не раскрывает; режим без партий сохранён.
- Повтор команды без дублей, изменённый payload отклоняется; ошибочная позиция откатывает весь заказ и резервы.
- Проверка очистки выбора исправила ошибку трактовки пустого значения как первого пункта.
- Тестовые товары изолированы от соседнего suite; запрос browser-сверки использует обязательный заголовок шлюза.
- На dirty3711539: web383/Core154 PASS; API/web build/typecheck, network187/mail15,112 checksum PASS.
- Connected browser chain PASS, exit0: выбор/очистка партий, физическая выдача, provenance, гостевой счёт и склад.
- Запуск/ручная проверка/риски: MARKET_COUNTED_LOT_HANDOVER_L2C.md; новых зависимостей и прав нет.
- После выдачи снимок устаревает; живые остатки, FEFO, возвраты и многопартийная выдача ещё не включены.
- Далее: распределение возвратов. Canva56 partial/84 pending; public web/APK без обновления.

## 2026-10-14 — L2b: ручная выдача сверенной партии
- Форма выдачи выбирает одну известную/неизвестную партию из свежей физической сверки; старый режим без партии сохранён.
- Migration0111: immutable lot_allocation + generated FK snapshot; guard проверяет scope/item/revision/количество под item lock.
- Фактическая выдача и provenance атомарны; replay без дубля, две независимые выдачи по одной сверке — один победитель.
- После выдачи сверка устаревает; дальнейшая выдача по партии требует пересчёта. Остаток партии автоматически не объявляется.
- На dirty2dca1fa: web383, Core supply/services/staff-auth153 PASS; API/web typecheck/build, network187/mail15 PASS.
- Целевой connected supply browser PASS, exit0: выбор партии, потеря ответа, повтор той же команды, история и устаревание.
- Red до реализации:2 failed/35 passed;111 checksum и diff check PASS. Общий гостевой browser chain не запускался.
- Запуск/риски/ручная проверка: SUPPLY_COUNTED_LOT_ISSUE_L2B.md; зависимостей и новых ролей нет.
- L2 целиком не завершён: распределение V Market/возвратов, живые остатки и FEFO ещё не включены.
- Далее: оставшиеся пути распределения движений; Canva56 partial/84 pending, public web/APK не обновлены.


## 2026-10-14 — L2a: журнал подготовки движений по партиям
- Migration0110: каждое новое supply_movement атомарно попадает в read-only intake; PK movement_id исключает дубли.
- Охвачены приход, ручная/маркет-выдача, корректировка, сверка L1 и возврат; откат audit откатывает intake.
- FORCE RLS по supply.read/object; runtime не может вставить/переписать журнал, чужой scope скрыт.
- API/история склада RU/UZ/EN показывают сведения прихода/сверки или ожидание распределения; старые движения not_tracked.
- На dirty8cd3065: web383, Core supply/services/staff-auth150 PASS; API/web typecheck/build, network187/mail15 PASS.
- Целевой connected supply browser PASS, exit0; общий гостевой browser chain в этом срезе не запускался.
- Red до migration0110:2 failed/39 passed;110 checksum и git diff --check PASS.
- Запуск/риски/ручная проверка: SUPPLY_LOT_MOVEMENT_L2A.md; новые зависимости и роли не добавлены.
- L2 ещё не завершён: intake не распределяет товар и не считает живые остатки партий; FEFO/просрочка отключены.
- Далее L2b — фактическое распределение всех движений; Canva56 partial/84 pending, public web/APK без обновления.


## 2026-10-14 — L1: физическая сверка партий
- Форма инвентаризации принимает1–20 партий (код/годность/количество) или явно неизвестную партию; RU/UZ/EN.
- Migration0109: immutable lot_counts + CHECK структуры/дат/суммы/дубликатов и индекс последнего снимка.
- Общий остаток не меняется: только adjustment0, existing scope/actor/RLS, revision, audit/outbox и replay.
- Сумма партий равна учётному остатку; устаревшее подтверждение запрещено; следующее движение устаревает снимок.
- На dirty664fac9: web383, supply/services/staff-auth149 PASS; API/web typecheck/build, network187/mail15 PASS.
- Целевой connected supply browser PASS: форма → preview → confirm → снимок → новое поступление → устаревший снимок.
- Red:1 failed/32 passed до реализации; green включает конкурирующие сверки/выдачу, повтор, scope и неверные данные.
- Проверены109 checksum; запуск/ручная проверка/риски: SUPPLY_LOT_COUNT_L1.md. Новых зависимостей нет.
- Снимок актуален на момент чтения, не живой учёт партий; FEFO/блокировка просрочки не включены.
- Canva56 partial/84 pending; public web/APK не обновлены. Далее L2 — распределение всех физических движений.


## 2026-10-14 — границы учёта партий
- Проверены receive/issue, инвентаризация, резерв/выдача V Market и возврат после инспекции.
- Полный учёт затрагивает все физические движения; изменение только ручной выдачи нарушит сверку партий с SKU.
- По правилу лимита ~300 строк реализация остановлена до разбиения; бизнес-код и миграции не менялись.
- План/критерии: SUPPLY_LOT_IMPLEMENTATION.md — L1 снимок физической сверки, L2 все движения, L3 FEFO/годность.
- L1 не объявляет снимок живым остатком: revision делает его устаревшим после движения.
- Проверка: ссылки на существующие модули/миграции, git diff --check; тесты реализации не запускались.
- Следующий программный срез: L1; публичный веб/APK и Canva-статусы без изменений.


## 2026-10-14 — проверка отзыва доступа к поездке
- Исправлена гонка браузерного теста: после View trip дождаться карточки перед проверкой отсутствия отмены.
- Добавлен сетевой барьер: отзыв во время detail-запроса → реальный404, очистка карточки, Try again → пустой список.
- Replay успешной отмены после отзыва по-прежнему запрещён; приложение/права/схема не менялись.
- На dirty833a47f: npm test382 PASS; Core supply/service-orders116 PASS; общий browser chain PASS, exit0.
- npm run build (включает typecheck), API typecheck/build PASS; network187/mail15 PASS; diff check PASS.
- Исходный повтор прошёл нестабильный участок; подтверждена гонка порядка запросов в проверке, не дефект авторизации.
- Промежуточный browser run пересёкся с пересборкой dist; финальный запуск выполнен после сборок и прошёл.
- Запуск/критерии/ручная проверка: GUEST_TRIP_REVOCATION_CHECK.md. Зависимости и миграции не добавлены.
- Нет push-отзыва уже открытой карточки; Canva56 partial/84 pending, public web/APK не обновлены.
- Далее: остатки и списание по партиям V Market отдельным срезом; FEFO/блокировка просрочки ещё открыты.


## 2026-10-13 — Canva23: партия и срок годности при приёмке
- SD-MK-001: парные поля код/дата в форме склада и журнале движений, RU/UZ/EN.
- Migration0108: nullable metadata + CHECK, существующие scope/RLS/append-only; старые строки без вымышленной партии.
- Одна партия на позицию приёмки; несколько партий — отдельные частичные приёмки; legacy body совместим.
- Replay сохраняет один приход; другой lot с тем же ключом даёт конфликт; календарные даты валидируются.
- На dirty6d606a2: web382, supply/service-orders116, staff-auth30 PASS; API/web build/typecheck PASS.
- Network187/mail15 PASS; целевой connected supply browser PASS, все команды завершились exit0.
- Общий browser: timeout guest-cancellation-browser-proof.cjs:62 до склада; полный прогон НЕ зелёный.
- Манифест дополнен0103–0108;108 checksum проверены без изменения старых миграций.
- Запуск/ручные проверки: design/CANVA_140_BLOCK_23_RECEIPT_LOTS.md; новых зависимостей нет.
- Нет остатков/списания по партиям, FEFO и блокировки просрочки; прошедшие даты допустимы как сведения.
- Canva56 partial/84 pending, полного PDF-аудита нет; public web/APK не обновлены.
- Далее: устранить сбой общей браузерной проверки; затем остатки и списание по партиям отдельным срезом.


## 2026-10-13 — Canva22: публичная история причин возврата сборки
- SG-MK-004/SD-MK-002/SS-MK-001: одинаковые публичные причины и серверное UTC-время у гостя и склада.
- Migration0107: bounded reopen_history20 + tracked reopen_count; запись атомарна с командой, replay не дублирует.
- Причина помечена «для гостя»; старые причины без disclosure не перенесены, внутренние ID отфильтрованы.
- На dirtybe4d1ba: service-orders85 PASS, web381 PASS; API/web typecheck/build PASS; network187/mail15 PASS.
- Проверены22 возврата →20 записей/count22; повтор, escaping текста, одинаковая гостевая история.
- Connected V Market browser PASS: текст/время совпадают в двух кабинетах, одна запись после возврата.
- Запуск/ручные проверки: design/CANVA_140_BLOCK_22_REOPEN_HISTORY.md; новых зависимостей нет.
- Canva56 partial/84 pending, полного PDF-аудита нет; public web/APK не опубликованы.
- Далее: учёт партий и сроков годности V Market отдельным вертикальным срезом; фото и переданные заказы остаются открыты.

## 2026-10-13 — Canva21: возврат сборки на согласование
- Picking/ready → reserved только складом после подтверждения физического возврата всех товаров и причины.
- Migration0106: приватная команда, повторная проверка scope/session, locks/revision/replay/audit/outbox; чек-лист очищается.
- Резерв/физический остаток/сумма не меняются; handed_over/completed запрещены; далее работает согласование нового состава.
- Общий lifecycle guard расширен только для privileged market reset; прямой runtime rollback запрещён.
- На dirty1319660: модуль услуг84 PASS, web376 PASS; API/web typecheck/build PASS; network187/mail15 PASS.
- Critical red→green: права, повтор, новая сборка, запрет после выдачи, гонка reopening/handover (один победитель).
- Connected V Market browser PASS: physical checkbox, общий резерв у гостя, обязательная повторная проверка сборки.
- Запуск/ручные проверки: design/CANVA_140_BLOCK_21_REOPEN_PICKING.md; новых зависимостей нет.
- Canva56 partial/84 pending, полной PDF-приёмки нет; public web/APK не опубликованы.
- Далее: отображаемая история причин возврата на согласование; фото/партии и обработка переданного товара остаются открыты.

## 2026-10-13 — Canva20: исключение позиции до сборки
- SG-MK-004/SD-MK-002/SS-MK-001: quantity0 исключает выбранный товар из предложения; последнюю позицию исключить нельзя.
- Migration0105 расширяет proposal workflow, не меняя старые миграции/права/атомарную замену резерва.
- До согласия/при отказе резерв сохраняется; согласие освобождает удалённый товар; фолио содержит только оставшиеся позиции.
- UI RU/UZ/EN объясняет0 и непустую корзину; API принимает0, БД проверяет полный состав.
- На dirtyc929e0a: Core32 PASS, web368 PASS, API/web typecheck/build PASS, network187/mail15 PASS.
- Новые проверки red→green: пустая корзина, отказ, повтор согласия, освобождение остатка, точное начисление.
- Connected browser V Market PASS: складское предложение0, оставшийся состав у гостя, явное согласие и отказ.
- Запуск/ручная приёмка: design/CANVA_140_BLOCK_20_REMOVE_LINE.md; полный PDF/Light-Dark аудит формы не заявлен.
- Canva56 partial/84 pending; public web/APK не публиковались, новых зависимостей нет.
- Далее: отдельный сценарий изменения заказа после начала сборки с учётом физического товара; фото/партии остаются открыты.

## 2026-10-13 — Canva19: согласование меньшего количества до сборки
- SG-MK-004/SD-MK-002/SS-MK-001: склад предлагает меньше единиц одной позиции, гость принимает/отклоняет состав и актуальную сумму.
- Migration0104 расширяет proposal workflow; проверки роли/владения/revision и существующая атомарная замена резерва сохранены.
- До согласия резерв неизменен; после согласия один связанный заказ, начисление только после получения.
- API schema, гостевая projection.kind и RU/UZ/EN формы; увеличение/0/изменение после сборки запрещены.
- На dirtyf83591a: Core31 PASS, web367 PASS; API/web typecheck/build PASS; network187/mail15 PASS.
- Новые критичные тесты red→green: bigint, повтор согласия, одна запись фолио, чужой доступ, отказ сохраняет резерв.
- Connected V Market browser PASS: предложение/отказ через guest+warehouse; исправлена доступная подпись нового select.
- Запуск/ручные проверки/ограничения: design/CANVA_140_BLOCK_19_QUANTITY_PROPOSAL.md; новых зависимостей нет.
- Canva56 partial/84 pending, полной PDF-приёмки нет; public web/APK не опубликованы.
- Далее: исключение недоступной позиции целиком до сборки; после сборки/фото/партии остаются отдельными срезами.

## 2026-10-12 — Canva18: история возврата V Market
- SG-MK-004/SD-MK-002/SS-MK-001: даты приёмки и инспекции у гостя и склада; RU/UZ/EN, явный UTC.
- Migration0103: nullable resolved_at, серверный trigger, без вымышленного historical backfill; существующие RLS/scope сохранены.
- API и гостевая проекция передают receivedAt/resolvedAt; replay не меняет время, внутренние ID скрыты.
- На dirtyb36be22: PostgreSQL16 V Market22 PASS; web363 PASS; API/web typecheck/build PASS.
- Network gate187 файлов и mail15 PASS; сквозной V Market browser PASS, Light/Dark390px guest+warehouse.
- Red→green: отсутствующие даты и потеря полей гостевым шлюзом; исправлено ожидание offline-состояния в тесте.
- Руководство/ручные проверки: design/CANVA_140_BLOCK_18_RETURN_TIMELINE.md; screenshots /tmp/views-return-*.png.
- Реестр:56 partial/84 pending, полной PDF-приёмки нет. Фото/партии/частичная выдача остаются открыты.
- Public web/APK не опубликованы. Далее Canva: частичная выдача с согласованием гостя и точным начислением.

## 2026-10-12 — M1.1 строгие даты расчёта проживания
- Исправлены local-date.ts и quote.service.ts: реальная дата, обязательный offset, checkout позже checkin до SQL.
- Тесты local-date.test.ts: ошибочные даты/400/no-DB, високосный год, эквивалентные offsets, DST.
- До исправления9 проверок падали; после23 новых проверок PASS.
- На dirty212b773: rates+booking PostgreSQL16 suite93 PASS,102 миграции/seed replay/isolation PASS.
- Web typecheck/test356/build PASS; API typecheck/build PASS; network gate187 файлов PASS; mail15 PASS; exit0.
- Контракт: DECISIONS.md; запуск/ручная проверка/риски: M1_BOOKING_DATES.md.
- Миграция и зависимости не нужны; старые клиенты с датами без offset теперь получают400.
- Браузерная и native-приёмка не заявлены; прежние M0 device/audit gates открыты; production не изменён.
- Далее: проверить покрытие гонок hold expiry/late payment и реализовать недостающий сценарий M1.

## 2026-10-12 — M0d.15 emulator acceptance blocked by Android OS
- Guest standalone x86_64 release APK built PASS3m57s from10e1e73; ARM64 APKs unchanged, artifact proof PASS.
- Isolated Android29 software AVD+loopback ADB5049 in disposable container; no PostgreSQL service/data mounted.
- ADB device online; boot completion not confirmed; screenshot shows System UI isn't responding.
- Install exit224: package service Broken pipe32. VIEWS launch/settings restart tests NOT_RUN.
- Evidence /workspace/views-artifacts/native15; owned emulator/ADB/observer stopped. No production changes.
- Reproduction/result M0D_MOBILE.md; DECISIONS forbids repeating unchanged failing emulator setup.
- Physical Android or accelerated runner needed for native acceptance;2 high audit blockers remain.
- Next independent slice: inspect M1 existing auth/catalog/booking tests and implement a missing scenario; native gates remain open.

## 2026-10-12 — M0d.14 native APK builds PASS
- Maven recovered; guest x86_64 debug PASS160 tasks; guest/staff ARM64 release-mode PASS240 tasks each.
- Standalone preview APKs (~26MB each) in /workspace/views-artifacts; embedded Hermes, no Metro required.
- TEST template signing only; guest/staff IDs distinct, Android24+, version0.1.0/code1. No production publish.
- On dirtyf877b6f: mobile tests12 PASS; APK signatures/ARM64/non-debuggable/profile bytecode/SHA256 PASS.
- Swapped-profile negative proof rejects; native source App matches checkout; diff check PASS.
- Script mobile-apk-proof.cjs; reproducible commands/manual checklist in M0D_MOBILE.md; proof JSON beside APKs.
- No device installation/runtime/persistence acceptance yet; existing KVM/adb restrictions remain.
- Two known high audit findings still block production; no fresh audit/full Core suites this slice.
- Next: install and test both profiles on ARM64 device; M0 remains open, mobile remains disconnected shell.

## 2026-10-12 — M0d.13 Android toolchain installed
- Google/Gradle connectivity recovered initially; installed SDK36/build-tools36.0.0/NDK27.1.12297006.
- Real Android preflight exit0; aapt2/clang execute; prerequisite/linking tests5 PASS on bb8795e.
- Gradle9.3.1 official SHA256 verified; local wrapper uses verified archive, proxy/CA configured without TLS bypass.
- Guest x86_64 debug build executed10 tasks then FAILED Google Maven gradle-api8.5.0 HTTP503; exact recheck503.
- APK/native acceptance NOT done. Remaining blocker is Maven access, not missing SDK. KVM/adb issues remain.
- Reusable environment helper /workspace/android-tools/configure-views-gradle.py; startup draft updated, not published.
- Instructions M0D_MOBILE.md. Application/DB/lock untouched; about5GiB free, caches preserved.
- No production/paid builds. Previous2 high audit blockers remain; fresh audit not run.
- Next: resume cached Gradle build when Maven recovers; publish environment snapshot to retain toolchain.

## 2026-10-12 — M0d.12 native storage linking
- Повторные HTTPS probes Google repository/Gradle checksum503; APK остаётся BLOCKED.
- Проверено независимое подключение хранения: Expo autolinking для guest/staff находит FileSystemLegacyModule57.0.7.
- Prebuild proof сохраняет autolinking.json и проверяет Gradle useExpoModules, версию и единственность пакета.
- На dirtyb9b3a2e: оба реальных native prebuild/linking PASS; mobile tests12 PASS; diff check PASS.
- Негативные тесты: missing/duplicate/wrong version/missing legacy/disabled Gradle integration.
- Приложение/зависимости/БД не менялись; новая JS сборка не нужна для diagnostic-only изменения.
- Инструкция M0D_MOBILE.md; native compilation/runtime/APK не подтверждены,2 high audit blockers остаются.
- Настройки среды не менялись; действующая команда prebuild автоматически включает новый proof.
- Далее: SDK/Gradle после восстановления сети, native build/device acceptance. M0 открыт.

## 2026-10-12 — M0d.11 native generation, APK BLOCKED
- Новый mobile-native-prebuild.cjs создаёт guest/staff Android projects только в /tmp.
- На dirty0cded39: оба Expo prebuild PASS; generated IDs/names корректны и различаются.
- Preflight/preferences tests7 PASS, diff check PASS; исходники приложения не менялись.
- SDK manager list PASS; install36/tools36/NDK27.1 завершился503, отдельный retry connection failure.
- Gradle9.3.1 wrapper download connection refused; независимые Google/Gradle HTTPS probes503.
- APK не собран, device/native IO не проверены; SDK preflight остаётся BLOCKED, KVM недоступен.
- Документация: M0D_MOBILE.md; ни TLS bypass, ни платных cloud builds, ни production действий.
- start_skill draft6acbfee482d48197bd74e4435d22391c сохранён; Save/Publish пользователем ещё не выполнены.
- Далее после восстановления загрузок: SDK install → Gradle build → native acceptance. M0 открыт.

## 2026-10-12 — M0d.10 native preflight, приёмка BLOCKED
- Добавлен mobile-android-preflight.cjs: версии из RN metadata, отсутствие SDK/components → exit1.
- На dirty93b4010: mobile tests10 PASS; реальный preflight exit1 (ожидаемый BLOCKED), diff check PASS.
- Обнаружен SDK в /workspace/android-tools/sdk; нет platform36/build-tools36.0.0/NDK27.1.12297006.
- KVM accel-check: CPU без vmx/svm; adb не смог создать ~/.android, device connection не установлен.
- Историческое software rendering failure учтено; native запуск/хранение/перезапуск НЕ проверены.
- CI запускает unit tests gate; наличие SDK не выдаётся за native acceptance.
- Инструкция/условия продолжения: M0D_MOBILE.md. Настройки установки среды не менялись.
- App/API/БД не менялись; APK/новая JS сборка не нужны для изменения диагностического скрипта.
- Далее: подходящий native runner и SDK36; прежние2 high по-прежнему блокируют выпуск.

## 2026-10-12 — M0d.9 persisted mobile preferences
- Theme/locale сохраняются в app-private JSON, guest/staff отдельно; до чтения выбор заблокирован.
- Только version/locale/theme; повреждённые/неподдерживаемые данные → ru/light, IO ошибки видны пользователю.
- Записи последовательные через temporary file/move; ошибка не блокирует последующие сохранения.
- Expo-file-system57.0.7 уже был в lock, теперь direct dependency; новых версий/пакетов нет.
- На dirty9384a69: offline frozen install/typecheck PASS; mobile tests7 PASS, palette drift check PASS.
- Финальные guest/staff Android exports/bytecode proof и diff check PASS.
- Критерии/запуск/ручной чек-лист: DECISIONS.md, M0D_MOBILE.md; native IO/device restart ещё проверить.
- Public web/APK/БД не менялись; full Core/web suites и свежий audit не запускались.
- Предыдущие2 high остаются блокерами выпуска; native device/iOS не проверены.
- Далее: приёмка хранения/интерфейса на native build; M0 остаётся открыт.

## 2026-10-12 — M0d.8 native shared palette
- @views/ui/native генерируется из tokens.css:17 цветов, светлая/тёмная темы с наследованием.
- Mobile использует общую палитру и переключатель темы ru/uz/en; default light, выбор только на сессию.
- CI --check отвергает drift; намеренное расхождение воспроизведено, после восстановления PASS.
- На dirtya06a26b: offline frozen install/typecheck PASS; profile/dependency tests3 PASS.
- Финальные guest/staff Android exports и bytecode profile proof PASS; git diff check PASS.
- Контраст fg на bg/surface обеих тем: минимум10.78:1; это не полный accessibility-аудит.
- API/БД не затронуты; новых внешних зависимостей нет. Lock меняет только внутреннюю workspace-ссылку.
- npm/GitHub503: pnpm запущен из проверенного локального кэша; отправка в GitHub недоступна.
- Риски:2 high из предыдущего audit остаются блокерами; свежий сетевой audit не выполнен.
- Инструкция/ручная проверка: M0D_MOBILE.md; native device/iOS/APK и публикация не выполнялись.
- Далее: native device acceptance и сохранение выбранной темы; M0 остаётся открыт.

## M0d.7 — UUID audit correction
- Узкий override xcode3.0.1>uuid11.1.1; остальные зависимости сохранены, новых библиотек нет.
- Критерии/решение: DECISIONS.md; запуск/риски: M0D_MOBILE.md; regression добавлен в CI.
- На dirty6507d95: до исправления buffer regression FAIL; после profile/dependency tests3 PASS.
- Frozen pnpm10.18.3 install, mobile typecheck, guest/staff Android exports и bytecode mode proof PASS.
- Prod audit exit1:2 high/0 moderate; UUID finding устранён, node-forge/braces остаются без published fix.
- Gate не ослаблен; upstream forge PR1152 и braces issue70 открыты. Выпуск заблокирован.
- Git diff check PASS. Полные web/Core suites, iOS/native device не повторялись; APK не создавался.
- Настройки установки среды прежние; публичные веб/APK и постоянная БД не менялись.
- Далее: native adapter общих UI-токенов; high blockers перепроверить перед выпуском.

## 2026-10-12 — M0d.6 Expo shell, выпуск заблокирован audit
- Добавлен apps/mobile Expo57/RN0.86/React19: guest/staff profiles с разными app IDs, ru/uz/en через shared, disconnected preview.
- React18 прежних клиентов сохранён; generated lock/peer snapshots отдельно от малого ручного среза.
- На dirty544ad7a: frozen install, workspace:check12/12, web356 tests, profile test1 PASS.
- Guest/staff Android Hermes exports PASS; APK/IPA, device/emulator, iOS и interactive Metro не проверялись.
- Найден stale guest mode в staff bundle; --clear исправляет, bytecode proof воспроизводит ошибку старого artifact и проходит для новых.
- CRM browser/Next HTTP, network187, mail15, diff check PASS; full PostgreSQL/Docker suites не повторялись.
- BLOCKER: prod audit FAIL (2 high/1 moderate), node-forge/braces в Expo CLI/Metro без patched version; CI gate сохранён.
- Инструкция/риски: M0D_MOBILE.md. Нет логина/API/платежей, native shared tokens пока не реализованы.
- start_skill draft6acbfee482d48197bd74e4435d22391c обновлён; Save/Publish не выполнены.
- Публичные веб/APK, постоянная БД и EAS cloud builds не затронуты. M0 открыт; далее устранение SDK audit blockers.

## 2026-10-12 — M0d.5 shared UI CSS
- Добавлен @views/ui: tokens.css и foundation.css; объединённые правила побайтно совпали с исходным foundation.
- Legacy CSS сохранил совместимый @import; root/CRM/Next объявляют workspace package, новые клиенты импортируют напрямую.
- CSS-only/sideEffects, без новых библиотек; manifest UI добавлен в Docker context для frozen workspace resolution.
- На dirty108e4e7: pnpm10.18.3 frozen install PASS; workspace:check10/10, web356 tests PASS.
- CRM browser9 ролей/3 языка/theme/mobile и Next HTTP6 routes/404/redirect PASS.
- Canva browser PASS:232 layout/126 contrast, минимум6.02:1,0 JS/API/external requests; не полный WCAG-аудит.
- Docker build/smoke PASS: non-root/read-only/prod deps, readiness, потеря БД503, без публичных портов.
- Network187, mail15, generator drift и diff check PASS; полный PostgreSQL suite не повторялся.
- Инструкция/ручной чек-лист/ограничения: M0D_UI.md; RN адаптер токенов ещё не реализован.
- Конфигурация среды не менялась: прежний frozen install подходит; публичные веб/APK и постоянная БД не затронуты.
- Далее Expo shell отдельным срезом; M0 открыт.

## 2026-10-12 — M0d.4 shared i18n
- Добавлен @views/shared/i18n: locales/Locale/translate и типы; прежний messages.ts совместимо реэкспортирует пакет.
- Root/CRM/Next объявляют workspace dependency; Next transpilePackages включён, без новых библиотек/версий.
- Сначала тест отсутствующего пакета падал; затем3 проверки совместимости/fallback/placeholder/prototype PASS.
- На dirty45335cb: frozen install в чистом snapshot и основном checkout PASS; workspace:check10/10, web356 tests PASS.
- Next HTTP6 routes+404/redirect и CRM browser9 ролей/3 языка/theme/mobile/noAPI PASS.
- Docker build/smoke PASS: non-root/read-only/prod deps, health/readiness, потеря БД503; shared manifest в context.
- Network187, mail15, generation drift и diff check PASS; полный PostgreSQL suite не повторялся.
- Инструкция: M0D_SHARED.md; start_skill/install_script не менялись, прежний frozen install подходит.
- Публичные веб/APK и постоянная БД не затронуты. Следующий срез packages/ui; затем Expo, M0 открыт.

## 2026-10-12 — M0d.3 Next guest/host shell
- Создан apps/web Next15.5.27/React18 Pages Router:6 SSR страниц guest/host × ru/uz/en, noindex, явный disconnected status.
- Критерии/запуск/ручной чек-лист: M0D_WEB.md; каталог, вход, бронь и тема здесь не реализованы.
- Next нужен для SSR; lock generated493 строки отдельно от ручного среза; прежние клиенты/БД не переносились.
- Prod audit выявил PostCSS: узкий override next>postcss8.5.29; повтор audit —0 известных уязвимостей.
- На dirty52cfb62: frozen install в изолированном snapshot PASS; workspace:check9/9 задач, web353 tests PASS.
- HTTP production и dev proofs:6 SSR маршрутов,3 ошибочных404, root307, локализованные ссылки/noindex — PASS.
- Исправлен формат Next config на mjs; generated next-env исключён из Git, typecheck без next-env с framework-env PASS.
- Network187, mail15, diff check PASS. Полный PostgreSQL suite/browser hydration отдельно не запускались.
- start_skill draft6acbfee482d48197bd74e4435d22391c обновлён; Save/Publish не выполнены.
- Публичные веб/APK и постоянная views_local не менялись. Далее shared/ui и Expo отдельными срезами; M0 открыт.

## 2026-10-12 — M0d.2 самостоятельный CRM shell
- Создан apps/crm React/Vite workspace:9 направлений, ru/uz/en, светлая/тёмная темы, явный disconnected preview.
- Роли/переводы/стили переиспользованы из src; нет API/логина/операционных данных, выбор роли не даёт прав.
- Lock добавляет CRM importer/peer snapshot без новых версий библиотек; старые приложения не перенесены.
- На dirty37dbd0f: clean snapshot + frozen pnpm10.18.3 install PASS; workspace:check7/7 задач, web353 tests PASS.
- CRM build/typecheck и HTTP dev loopback4174 PASS; browser9 ролей/3 языка/theme/mobile/noAPI/noJSerrors PASS.
- Browser proof сначала выявил неоднозначные labels; добавлены локализованные aria-label, повтор PASS; proof добавлен в CI.
- Network187, mail15, git diff --check PASS; PostgreSQL/Core556 отдельно не повторялся, серверная логика неизменна.
- start_skill draft6acbfee482d48197bd74e4435d22391c обновлён; Save/Publish не выполнены, восстановление новой среды не проверено.
- Инструкция/ручной чек-лист/риски: M0D_CRM.md. Постоянная БД и публичные веб/APK не менялись.
- Далее: Next.js shell отдельным срезом; Expo и packages/shared/ui ещё впереди, M0 открыт.

## 2026-10-12 — M0d.1 одноразовый dev:local
- Добавлена команда dev:local: сборка web/API, disposable PostgreSQL16, checksum migrations и synthetic seeds.
- Core и guest BFF слушают случайные loopback порты; проверяются readiness, HTML, session=false и trips401.
- Runtime без superuser/BYPASSRLS, прежние seed/изоляция/overbooking proofs выполняются при запуске.
- Email delivery adapter отсутствует явно: вход через письмо пока недоступен, внешних отправок нет.
- На dirty601562a: npm run dev:local -- --smoke и повторный smoke с checksum applier — exit0; обе сборки PASS.
- Network gate187, mail15, generator drift check, syntax и diff check PASS; полный API/UI suite не повторялся.
- Lifecycle proof PASS: readiness, trips401, SIGTERM, нет утечки контейнера; Docker --rm ожидается до5 секунд.
- start_skill сохранён в draft6acbfee482d48197bd74e4435d22391c; Save/Publish среды ещё не выполнены.
- Постоянные views_local и её state не использовались; публичного веб/APK деплоя нет.
- Инструкция/риски/ручной чек-лист: M0D_LOCAL.md; это первый M0d срез, без hot reload и оболочек Next/Expo.
- Далее: минимальные каркасы приложений отдельным срезом; M0 целиком открыт.

## 2026-10-12 — M0c.1 OpenAPI → клиент → «Мои поездки»
- Добавлен contracts/guest-trips.openapi.json для существующих Core list/detail; схема БД неизменна.
- Генерируются типы и методы; существующий GuestTrips подключён через прежний wrapper/защищённый BFF transport.
- Runtime validation, точные строковые суммы, session errors и no-store сохранены; зависимостей нет.
- Тест сначала падал без генератора; затем drift/transport/money/error checks3/3 PASS.
- На dirty1a1b506: web353 tests PASS; web/API build, network gate187, mail15 и diff check — exit0.
- Disposable PostgreSQL проверяет реальные ответы GuestTripsService по OpenAPI; guest trips7/7 и полный Core556/94 PASS, exit0.
- Генератор намеренно ограничен текущим GET-подмножеством; это первый контракт, не весь API.
- Browser/HTTP отдельно не повторялись; постоянная БД, публичные веб и APK не изменены.
- Инструкция/ручной чек-лист: M0C_OPENAPI.md. Далее M0d: dev:local и минимальные каркасы приложений.

## 2026-10-12 — M0b.3 повторяемые synthetic seeds
- Core runner применяет7 seed-блоков через checksum ledger в закрытой seed_private.
- Каждый блок и запись истории атомарны; advisory lock сериализует параллельные подключения.
- Replay пропускает неизменённый блок; изменение checksum отклоняется, прежняя история сохраняется.
- Допускается только views с маркером VIEWS_DISPOSABLE_CORE_TEST; функция не выставляет маркер сама.
- На dirty614b26d: disposable PostgreSQL16 proof —7 replay, checksum, guard, rollback, concurrent exactly-once и private schema PASS.
- node scripts/cloud-core-tests.cjs:556 tests/94 files PASS; SQL administrative proofs PASS, exit0.
- Mail acceptance15/15, network gate186, node syntax и git diff --check PASS.
- SQL миграций/seed-файлы не изменены; постоянная views_local и публичные веб/APK не затронуты.
- Граница: только disposable Core runner; legacy/persistent seed paths не переведены, Windows не проверялся.
- API/UI build не повторён: исходники приложения неизменны; HTTP/SMTP proof отдельно не запускался.
- Инструкция: M0B_MIGRATIONS.md. Далее M0c: OpenAPI → generated client → экран и contract test.

## 2026-10-12 — M0b.2 перенос PostgreSQL migrations
- Перенесены102 SQL из каталога API в db/migrations; Git распознаёт100% rename, байты/имена/manifest неизменны.
- Обновлены Linux/Windows launcher, Core/mail/proof scripts, CI loops/filters, Compose read-only mount и ссылки docs.
- Seeds/tests API и legacy D1 SQL остаются на прежних местах; существующий ledger не менялся.
- На dirtye7ebaab: manifest tests и PostgreSQL16 clean102/upgrade46→102 proof прошли, schema/ACL совпали.
- Nest build, Core556/94, HTTP laundry и guest-email/loopback SMTP — exit0; внешних писем нет.
- Почтовые/evidence tests100/100, network gate186, Compose mount/YAML, node syntax и git diff --check — pass.
- Проверены все102 SQL против исходных Git blobs; старых путей PostgreSQL в executable consumers не осталось.
- Постоянная views_local не запускалась/не изменялась; публичные веб/APK не обновлялись.
- Ограничения: Windows runtime и полный staff-mail DB proof отдельно не запускались; remote CI не подтверждён.
- Инструкция: M0B_MIGRATIONS.md. Следующий M0b.3: повторяемый synthetic seed в одноразовой БД.

## 2026-10-12 — M0b.1 checksum и clean/upgrade proof
- Добавлен db/migrations.sha256 для102 SQL; исходные SQL побайтно совпадают с6b0d67a.
- Применение вынесено из cloud-local-rehearsal в migrations.cjs; ledger и внешний advisory lock сохранены.
- Исправлена проверка BEGIN: комментарии в0079/0098 больше не блокируют запуск; hash исходников не меняется.
- Manifest tests проверяют изменение/удаление SQL и отсутствие транзакции; CI запускает manifest + DB proof.
- На dirty6b0d67a disposable PostgreSQL16: clean102 и upgrade46→102 дают одинаковую схему/ACL при views_app.
- Synthetic organization сохранена; повторный запуск0 изменений и прежние timestamps истории сохранены.
- Checksum mismatch/неизвестная история отвергаются; ошибочная0103 полностью откатывается без записи checksum.
- Проверено: manifest test, DB proof, node syntax, CI YAML, git diff --check — exit0; контейнер удалён.
- Постоянная views_local не затронута; app/UI не менялись, их предыдущие build/test результаты не перепроверялись.
- Инструкция и ограничения: M0B_MIGRATIONS.md; один checkpoint/organization не доказывает все случаи миграции данных.
- Далее M0b.2: перенос SQL в db/migrations и обновление всех путей; M0b в целом ещё открыт.

## 2026-10-12 — M0a.3c единый dependency lock
- Удалены root/API npm locks; pnpm-lock остаётся единственным, его SHA256 и manifests не изменились.
- Generated deletion9669 строк отдельно от ручного diff; прежние locks сохранены в Git до84da7d0.
- README, cloud runbook и устаревшее примечание AGENTS согласованы с pnpm frozen workspace install.
- Проверено на чистом snapshot84da7d0 без npm locks: полный frozen install,5 Turbo tasks, web350/68 pass.
- Профильные API tests20/3, mail15, network186, workspace audit0 известных уязвимостей — pass.
- Docker build и smoke pass: non-root/read-only/prod deps, health/readiness, потеря БД503; постоянная БД не затронута.
- Все executable install-пути проверены; npm global install закрепляет только pnpm, npm run остаётся совместим.
- Full Core556/94 и browser suites не повторялись: API/UI/версии неизменны; прежние результаты сохранены.
- install_script среды сохранён draft b74ec9de-e793-4fac-a736-09fd0d0b7686~cecfgdraft_6acbfee482d48197bd74e4435d22391c.
- Активация draft через Environment settings Save→Publish ещё не выполнена; восстановление нового task не проверено.
- Ограничения: внешний Cloudflare install override/remote CI не проверены; публичной публикации нет.
- Репозиторный M0a завершён. Далее M0b: перенос миграций, clean+upgrade и сохранность прежних checksum.

## 2026-10-12 — M0a.3b Docker API и отказ БД
- Docker использует workspace context, allowlist .dockerignore, pnpm10.18.3 frozen и отдельные prod deps.
- Node24.19.0 Debian slim закреплён digest; non-root runtime сохраняет совместимый /app alias.
- Добавлены api-container-smoke.cjs и build/smoke в основной CI; compose права/сети/volumes сохранены.
- Проверено на43ebc7a + dirty diff: Docker build pass; API sources test snapshot совпадают с рабочими.
- Image sha256:eba73a9ed82f482076d902e6a5e039a28dc20c4722d228b45a94ba386bbfb3de.
- Smoke: UID non-root, read-only, no dev tools, /health200, /readiness200→503 после остановки БД, /app/ops pass.
- Найден и исправлен crash от idle pg Pool error; regression сначала red, затем green; лог только постоянного кода.
- API typecheck/build и Core556/94 pass; topology17, origin11, mail15, network186 без нарушений.
- Compose render/YAML/git diff --check pass; временные smoke containers/network удалены, views_local не тронута.
- Cloud build использует имеющиеся proxy и CA через BuildKit secret; TLS/integrity сохранены, CA не в образе.
- Риски: remote CI/публикация не проверены; smoke не заменяет миграционные проверки; UI/APK не обновлялись.
- Далее M0a.3c: сверить оставшиеся install-потребители и устранить legacy npm locks; полный M0 ещё открыт.

## 2026-10-12 — M0a.3a остальные GitHub install jobs
- M0a.3 разделён: CI сейчас; Docker/legacy locks в M0a.3b, чтобы сохранить небольшой проверяемый diff.
- Все15 install jobs: pnpm10.18.3, Node24.19.0, frozen workspace; две повторные установки удалены.
- Три audit gates проверяют весь workspace; path filters дополнены pnpm lock/config, права и ветки сохранены.
- Исправлен Node24 reporter: явный TAP в egress runner и staff-email evidence командах, gate не ослаблен.
- Чистый source snapshot8358a7e + diff: frozen --ignore-scripts из apps/api установил оба проекта;5 Turbo tasks pass.
- Web350/68, Core555/93, HTTP laundry/email и loopback SMTP pass; постоянная БД не использовалась.
- Egress71/71 и валидный machine report; evidence85/85, mail15/15, network186 без нарушений.
- Workspace production audit:0 известных уязвимостей; YAML/фильтры/права/git diff --check pass.
- Повторный browser suite не запускался: код/lock неизменны, предыдущая проверка M0a.2 сохранена.
- Риски: Docker всё ещё npm без frozen lock; npm locks сохранены; внешние Cloudflare Build settings не проверены.
- Далее M0a.3b: workspace Docker context, frozen container build/smoke, затем согласованное устранение legacy locks.
- Публичной публикации нет; remote GitHub CI для этого diff ещё не подтверждён.

## 2026-10-12 — M0a.2 Turbo и основной CI
- Добавлены turbo.json, workspace:check и workspace:test:core; scripts совместимы, новых зависимостей нет.
- CI закрепляет Node24.19.0/pnpm10.18.3, frozen install; security/audit/browser checks сохранены.
- Turbo выполняет5 задач, concurrency2, cache:false; Core отдельно в disposable PostgreSQL16.
- Проверено на source snapshot addad67 + текущий dirty diff: frozen install и5/5 Turbo tasks exit0.
- Web350/68, Core555/93, mail15/15; HTTP laundry и guest-email/loopback SMTP — pass.
- Три browser suites — pass, pageErrors0; это synthetic/demo/HTTP fixtures, не проверка production.
- Network gate186 без нарушений, egress policy pass, root prod audit0 vulnerabilities; shell syntax pass.
- Команды/ограничения: M0A_WORKSPACE.md; cache и отдельный Core runner объяснены в DECISIONS.md.
- Постоянная БД и рабочие node_modules сохранены; публичные веб/APK не обновлялись.
- Риски: remote GitHub CI ещё не подтверждён; legacy workflows пока npm; M0 не завершён.
- Следующее M0a.3: перевести оставшиеся install-пути/аудит на workspace без двойных lock-источников.

## 2026-10-12 — M0a.1 импорт workspace завершён
- После «следующий шаг» согласовано исключение для generated lock; архитектура M0–M8 принята.
- Добавлены pnpm-workspace.yaml/pnpm-lock.yaml; pnpm10.18.3, Turbo2.5.8; root+apps/api.
- Все26 прежних прямых версий сохранены; Express5.2.1 объявлен явно, API @types/node22.20.5 закреплён.
- npm-lockfile синхронизированы для прежнего CI; существующие scripts не менялись.
- Проверено в отдельном source snapshot поверх fe3565c: полный frozen install, web/API build/typecheck, exit0.
- Web350/68 и Core555/93 прошли; HTTP laundry и guest-email/loopback SMTP прошли, внешних писем нет.
- Network gate186 без нарушений, mail15/15; npm ci --dry-run для root/API успешен.
- Описание/команды: M0A_WORKSPACE.md; generated lock5022 строки, остальной diff менее300 строк.
- Working node_modules и persistent views_local не менялись; публикации нет.
- M0 остаётся открыт. Следующий срез M0a.2: Turbo task graph+CI; затем M0a.3 убрать двойные install-пути.
- Риски: браузер/UI на устройствах в этом срезе не проверялся; Next/Expo/codegen/dev:local ещё не реализованы.

## 2026-10-12 — M0a preflight после «ок»
- Архитектура/план M0–M8 согласованы; M0 ещё не завершён.
- План разбиения: M0A_WORKSPACE_PLAN.md; код/зависимости рабочего дерева не менялись.
- Пробный импорт вне репозитория: pnpm10.18.3, Turbo2.5.8, два importer.
- Generated pnpm-lock:5019 строк; выходит за согласованный лимит около300 строк.
- Все26 прямых версий сохранены после pin API @types/node22.20.5 в пробном manifest.
- Проверено: pnpm import и frozen --lockfile-only --ignore-scripts, exit0; полная установка не проверена.
- Исключение для generated lockfile требует согласования; до него внедрение остановлено по правилу размера среза.
- Предлагается M0a.1 импорт/manifest, M0a.2 Turbo+CI, M0a.3 перевод оставшихся install-путей.
- Следующее: согласовать отдельный generated lock; затем полный frozen install/build/test в песочнице.
- Риски: транзитивные зависимости и install scripts ещё проверить; npm workflows пока остаются прежними.
- Постоянная БД, опубликованные web/APK и реальные интеграции не затронуты.

## 2026-10-12 — аудит и план до кода (история; «ок» получено)
- Источники: SPEC.md / ARCHITECTURE.md / DECISIONS.md; аудит: AUDIT_M0.md.
- Ветка stage7/staff-email-delivery-v1; последний код47a33cf, документацияd3c5c74; draft PR54.
- Локальная база: очередь консьержа и migration0102. Исторически web350; API554 до guard-fix, затем31 профильный тест и HTTP/BFF/browser прошли.
- Публичный preview0.15/eae64e1: Core/email/payments отключены; Canva56 partial/84 pending, PDF-приёмки нет.
- Найдены10 проблем; целевой стек и совместимый переход записаны в DECISIONS.md, пока не согласованы.
- Проверка этого шага: только документы, ссылки и git diff --check; сборки/тесты не перезапускались.
- Блокеры production: провайдеры/договоры, vault/хранение, юридические правила, операционная и нагрузочная приёмка.
- На момент аудита ожидали «ок»; затем владелец согласовал старт M0 (см. запись выше).
- После «ок»: M0a workspace/task graph; критерии: frozen install, прежние команды работают, CI проверяет API+web, persistent DB не затронута.
- Следующие частиM0 и история очереди нарушений не потеряны: DECISIONS.md и design/CANVA_140_BLOCK_17_OVERDUE_QUEUE.md.
- Работа только в ветке/локальной песочнице, без реальных секретов/платежей, reset/force-push и публикации.

## Дорожная карта и критерии приёмки
Ни одна веха не закрыта целиком. Уже работающий код переиспользовать; внешний gate нельзя заменить synthetic-тестом.
| Веха | Проверяемые критерии завершения |
|---|---|
| M0 каркас | pnpm/Turbo workspace с API/web/CRM/mobile/shared/ui; frozen install и CI build/typecheck; один генерируемый HTTP-клиент проходит contract test; все миграции clean+upgrade с прежними checksum; synthetic seed повторяем; одна команда dev:local и readiness запускают loopback sandbox без изменения views_local. |
| M1 бронирование | SMS OTP с лимитами/одноразовостью и проверкой доставки; каталог/пагинация, итоговая цена со снимком налогов/сборов; hold/expiry, EXCLUDE и гонка двух броней дают одного победителя; отмена/возврат учитывают часовой пояс и замороженную политику; unknown/late payment не создаёт двойную бронь. Внешняя SMS отдельно принята. |
| M2 финансы | Payme/Click/Uzum по подтверждённым контрактам; дубликаты/нарушенный порядок webhook не меняют деньги повторно; проводки сбалансированы; refund/partial refund/депозит/reconciliation и фолио согласованы; чек связан с операцией, retry не создаёт второй; sandbox/certification каждого провайдера и бухгалтерская приёмка. |
| M3 CRM API | Шахматка/перенос без овербукинга, заезд/выезд, задачи/инспекция, гости/сотрудники/роли; cross-tenant/property тесты; весь фонд500 доступен через страницы; очередь регистрации иностранцев со сроками/подтверждением; документ только через vault; турсбор по версионированной конфигурации и отчёт сверяются. E-mehmon/ставки «проверить». |
| M4 услуги/SLA | Единые каталог/заказ/задача и4 режима: свои/диспетчер-партнёр/API/affiliate; продавец/платёж/возврат определены; назначение по навыкам/смене/нагрузке без дублей; таймеры с календарём/паузами переживают рестарт; повтор событий не дублирует задания/эскалации; смена исполнителя атомарна; провайдерская ссылка не выдаётся за завершённый заказ. |
| M5 гость | Next.js+Expo: поиск/карта/карточка → бронь/оплата → поездка/услуга/поддержка/отмена на Core; RU/UZ/EN, Light/Dark, accessibility и offline/retry; перечень гостевых Canva ID принят по функциональности и дизайну; Android/iOS проверены на устройствах, токены защищены. |
| M6 персонал | CRM/Vite и Expo staff: свои заезды/выезды, фолио, гости/юниты, housekeeping/задачи/чек-листы/фото, закупки/склад; роли разделены сервером; полный сквозной сценарий от запроса до инспекции, дубли offline не создают повторных операций; приёмка staff/CRM Canva ID. |
| M7 хост/админ | Онбординг/проверка хоста, объекты/цены, модерация, комиссии/выплаты/споры; тест изоляции хостов; акты/сверка/идемпотентность выплат; зарплатный расчёт по версиям правил, утверждение и аудит, без автоматических незаконных удержаний; юридическая схема и бухгалтер принимают результаты. |
| M8 интеграции/запуск | iCal/каналы дедуплицируют периоды и соблюдают EXCLUDE; замки выдают/отзывают коды без логирования; threat model и проверка прав/egress, dependency scan; нагрузочный профиль на500 и план100000 с подтверждённым p95 чтения≤300мс; согласованные RPO/RTO проверены восстановлением; метрики/SLO99.9%, on-call/rollback, dry-run миграции фонда, правовой checklist и поэтапный пилот. |

Приёмка каждого среза: 3–7 критериев → тест критичной логики → код → проверки → запись до15 строк. Изменения примерно до300 строк; крупный перенос сначала разбить. Не закрывать веху по числу экранов или одному зелёному build.
