# Срез36 — отказ от описи и возврат без обработки

Критерии приёмки:
1. Владелец quoted-заявки с описью видит отказ из общей карточки, в том числе после выезда.
2. Review объясняет ожидание возврата без обработки и начисления; нужны checkbox и явная отправка. Закрытие review сбрасывает согласие.
3. Команда связывает intakeId/revision; ответ требует awaiting_return, следующую revision, null orderId и корректную полную опись.
4. Потерянный/повреждённый ответ сохраняет ключ/тело; повтор даёт одно событие отказа без заказа/начисления, переходы и выход защищены.
5. Новая котировка отклоняет старую команду; ручное обновление сбрасывает review/checkbox. Иные стадии не предлагают отказ.
6. Отказ оставляет вещи на ответственности прачечной; только staff return_unprocessed завершает возврат. Исторический replay не возвращает стадию назад.
7. RU/UZ/EN, обе темы, 390px и offline проверяются в браузере; серверные права действуют и после выезда.

Допущения: используем существующий API/SQL0123 и поведение направления прачечной: reject разрешён владельцу после выезда.
Это запрос возврата вещей, не подтверждение физической передачи и не возврат денег. Миграции/сиды/новые зависимости не нужны.

Реализация: GuestLaundryReject показывает review/checkbox/подтверждение и позволяет оставить опись на рассмотрении.
GuestOrderDetail сохраняет pending вне очищаемой карточки; guest-laundry-reject требует null orderId и отсутствие претензии.
Действующий gateway опускает claim:null; helper принимает null/отсутствующее поле, но отклоняет объект и другие значения. Общий API не меняется.
Сохранённый awaiting_return при повторе остаётся допустимым после последующего возврата сотрудником; свежий GET показывает текущую стадию.
При awaiting_return карточка поясняет, что старый returnBy относится к отклонённой котировке; время передачи уточняет сотрудник.

Запуск synthetic-среды: `npm run dev:local`.
Проверки: `npm test`, `npm run build`; в apps/api: `npm run typecheck && npm run build`.
`node scripts/core-network-primitive-gate.mjs`; `node --test scripts/staff-mail.acceptance.cjs`.
Core/browser: `VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/supply src/service-orders src/staff-auth`.
Для точечного браузерного прогона добавить `VIEWS_ORDER_LIST_BROWSER_ONLY=true`.

Что проверить вручную: поездка → заказы → quoted прачечная → отказ → оставить опись/подтвердить с checkbox.
Без согласия POST нет; после отказа вещи ожидают передачи, заказ и начисление не возникают.
При потере ответа повторить ту же операцию; смена описи до отправки даёт409 и требует ручного обновления.
После выезда отказ остаётся доступен владельцу. Сотрудник подтверждает реальную передачу через return_unprocessed.
Проверить RU/UZ/EN, обе темы, мобильный экран, offline и отсутствие кнопки на других стадиях.

Риски: pending остаётся в памяти; hard reload/закрытие вкладки требует отдельного восстановления.
Claims wrapper0101 и поздний folio wait остаются вне среза; новые финансовые действия здесь не добавляются.
Только disposable PostgreSQL/loopback SMTP; реальная передача вещей и внешний провайдер не проверяются тестом.
Public web032ea93/Cloudflare/APK, Canva56partial/84pending/0fullyaccepted без изменений. Блокирующих вопросов нет.

Проверено на dirty f68527f: RED unit с отсутствующим helper собрал0тестов; старый dist упал на отсутствующей кнопке отказа.
Первый full browser остановился на прежнем staff findIntake; helper теперь ждёт конкретный GET/HTTP200 и соответствующие DOM IDs/Next.
Первый focused дошёл до replay и обнаружил claim:null→отсутствие в gateway. Реальная projection() воспроизвела1failed/47passed;
после совместимой проверки все48новых unit и общий web689/86files PASS. Проекция, серверные права и rate limits не менялись.
Core212/23files, web/API typecheck/build, network187/mail15,123checksum PASS. Финальный full exit0:212Core и19HTTP/browser proofs.
Проверены реальные staff-команды под views_app, held/lost/invalid/replay, один reject audit/outbox,orders/folio0,
same-price requote409/manualGET, отказ после checkout, staff return_unprocessed и исторический replay без отката текущей стадии.
RU/UZ/EN×Light/Dark×390px PASS; выборочно просмотрены RU Light/UZ Dark, независимое ревью без блокеров. Полной Canva-приёмки нет.
Далее: авторизация confirm_receipt после ожидания блокировки фолио перед добавлением получения/начисления в общую карточку.
