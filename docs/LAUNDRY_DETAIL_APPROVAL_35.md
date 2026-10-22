# Срез35 — согласование прачечной из общей карточки

Критерии приёмки:
1. Действие доступно только для quoted с описью/суммой/сроком возврата и действующим заездом.
2. Карточка показывает опись, итоговую цену и срок; отправка требует явного согласия, в том числе при requestSubmit.
3. Команда связывает intakeId/revision/expectedTotalMinor; деньги передаются строкой bigint без потери точности.
4. Пересогласование даже с прежней суммой отклоняет устаревшее согласие; ручной GET показывает новые условия и сбрасывает checkbox.
5. Повреждённый/потерянный ответ сохраняет ключ/тело; повтор возвращает один заказ и одно событие принятия, без начисления.
6. При успехе квитанция строго проверяется; offline/переходы/внешние действия защищены; RU/UZ/EN и обе темы проверены.

Допущения: существующий API/SQL0123 связывает всю опись, валюту и срок через revision под блокировками.
Новых полей API, таблиц, миграций или сидов не требуется. Принятие разрешает обработку вещей; начисление после подтверждения возврата.

Реализация: GuestLaundryApprove добавляет явное согласие; GuestOrderDetail держит pending вне очищаемой карточки.
guest-laundry-accept проверяет точную сумму, ID, следующую revision, accepted/orderId и полную квитанцию с описью.
Неверный ответ остаётся неопределённым; ручной повтор сохраняет ключ/тело. Конфликт требует свежего GET и нового согласия.
Новых зависимостей или прав нет. Существующий экран направления прачечной сохранён.

Запуск synthetic-среды: `npm run dev:local`.
Проверки: `npm test`, `npm run build`; в apps/api: `npm run typecheck && npm run build`.
`node scripts/core-network-primitive-gate.mjs`; `node --test scripts/staff-mail.acceptance.cjs`.
Core/browser: `VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/supply src/service-orders src/staff-auth`.
Для точечного браузерного прогона добавить `VIEWS_ORDER_LIST_BROWSER_ONLY=true`.

Что проверить вручную: поездка → заказы → quoted прачечная → опись/итоговая цена/срок → checkbox → согласование.
Без согласия нет POST; после успеха статус accepted, начислений нет. Повтор при потере ответа не создаёт второй заказ.
Изменить опись/цену/срок сотрудником до согласования: отказ409, затем ручное обновление и пустой checkbox.
При requested/accepted/выезде согласование скрыто; проверить offline, RU/UZ/EN, Light/Dark и узкий экран.

Риски: pending хранится в памяти; hard reload/закрытие вкладки требует отдельного durable recovery.
Авторизация использует прежнюю SQL0123; claims wrapper0101 и поздний folio wait остаются вне среза.
Время показывается с явной пометкой часового пояса устройства; актуальный срок проверяет сервер при принятии.
Только disposable PostgreSQL/loopback SMTP; публичные web032ea93/Cloudflare/APK не обновлялись.
Canva56partial/84pending/0fullyaccepted: функциональное расширение существующей карточки, без полной визуальной приёмки.
Блокирующих вопросов нет.

Проверено на dirty fca3a81: RED unit — отсутствующий helper,0собранных тестов; старый dist дал exit1 на отсутствующей кнопке.
Новые48unit PASS; общий web641/85files, Core211/23files, web/API typecheck/build, network187/mail15,123checksum PASS.
Полный Core/browser exit0:18структурированных HTTP/browser proofs; среди них есть явно помеченные HTTP fixtures.
Новый proof использует настоящие staff receive/quote под views_app без superuser/BYPASSRLS и реальные гостевые HTTP-команды.
Held200→lost→malformed replay→valid replay сохраняет key/body: один заказ/audit/outbox, ноль начислений; bigint больше2^53 точен.
Requote409/manualGET сбрасывает согласие; отдельный Core-тест проверяет новую опись/срок при прежней сумме и замороженный snapshot.
Requested/accepted/checkout, offline/navigation/logout, RU/UZ/EN×Light/Dark×390px PASS; обе темы просмотрены, независимое ревью без блокеров.
Следующий срез: отклонить опись и запросить возврат без обработки из общей карточки.
