# Блок27 — прямая загрузка заказа

Критерии:
1. GET `services/details/{kind}/{id}?reservationId=UUID` возвращает только выбранный заказ,
   где kind: cleaning/laundry/market/concierge; laundry использует intakeId.
2. Сессия, текущая принадлежность поездки, организация/объект проверяются в БД;
   чужой ID, другой вид услуги и отсутствующий заказ дают одинаковый отказ404.
3. Только GET и единственный reservationId; cursor/лишние/повторные параметры запрещены,
   service/market pilot flags действуют в API и gateway, ответ no-store.
4. Старая страница/курсор не влияют на детали. Ровно один ответ нужного ID;
   offline/ошибка/отзыв доступа/поздние ответы очищают карточку как раньше.
5. История после выезда доступна; чтение не создаёт заказы, начисления и события.
   Денежная точность и публичные проекции сохранены, внутренние stock IDs скрыты.

Migration0119 добавляет одну SECURITY DEFINER функцию с фиксированным search_path и REVOKE PUBLIC.
Новых таблиц/индексов нет: выборка использует существующие PK и связь с поездкой.
API возвращает совместимый single-item envelope `{items:[item],nextCursor:null}`;
снимок SLA консьержа вычисляет прежний helper. Действия в карточке — следующий срез.
Новый отдельный synthetic seed для трёх товаров не изменяет старые seed/checksum;
RLS не ослаблена. Только disposable PostgreSQL; реальные внешние операции отключены.

Запуск: `npm run dev:local` (synthetic). Проверки: web `npm test && npm run build`,
API `npm run typecheck && npm run build`, `node scripts/core-network-primitive-gate.mjs`,
`node --test scripts/staff-mail.acceptance.cjs`, `node scripts/guest-order-detail-lifecycle.browser.cjs`,
`VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/supply src/service-orders src/staff-auth`.
Проверить вручную: переключение поездок/заказов, чтение после выезда, локали/темы/фокус,
реальная опись/претензии/кредиты на разных стадиях. Полная визуальная PDF-приёмка остаётся открытой.
Новых зависимостей нет; public web/Cloudflare/APK без изменений, реестр56 partial/84 pending.

Проверено на dirty `a09bffe`: web520/81files, выбранные Core supply/service-orders/staff-auth165/19files;
обе сборки/typecheck, network187/mail15,119 migration checksums, diff check PASS.
Полная connected browser chain exit0: четыре прямых GET, strict query/method, второй страницы cursor нет,
RU/UZ/EN×Light/Dark×390px, offline/revocation/read-only; lifecycle7reads PASS (StrictMode/target/unmount).
Red: missing SQL function и старый UI маршрут; review нашёл normalized-URL обход market flag,
три regression cases воспроизвели его и после исправления прошли; gateway40 PASS.
Первый общий browser run остановился в market; после teardown только трёх своих synthetic товаров повтор exit0.
Изоляция seed проверена8replays; independent security review PASS. Полной приёмки140 экранов не заявляем.
