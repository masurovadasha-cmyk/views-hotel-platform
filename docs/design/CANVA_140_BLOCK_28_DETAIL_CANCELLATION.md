# Блок28 — отмена уборки из карточки

Обновление: ограничение cached replay отмены/переноса исправлено [срезом29](../CLEANING_REPLAY_AUTHORIZATION_29.md), migration0120. Нижние результаты относятся к исходному срезу28.

Критерии: явное подтверждение до POST; только requested/assigned в текущем проживании;
точные orderId/revision и существующий CSRF; потерянный/невалидный ответ сохраняет ключ и тело;
pending блокирует выход/обновление, включая offline; stale/отзыв доступа очищает карточку;
успех перечитывает точный заказ, одно событие отмены, без начислений и автоматических повторов.

Использованы действующие migration0073 (команда) и0119 (read), API и useCleaning;
новая миграция/таблицы/зависимости не нужны. GuestCleaningChange ограничен отменой в деталях;
прежний перенос времени в направлении сохранён. SG-GN-006/007/008 остаются partial.
Очередь и подтверждение операции живут вне очищаемой карточки, чтобы offline не терял ключ.
Старый pending guard внешнего logout/привязки брони остаётся отдельной задачей.
Унаследованный cached replay SQL0073 не перепроверяет отзыв доступа после ожидания advisory lock;
новых изменений данных при replay нет; исправление и concurrency proof — отдельный срез.

Запуск: `npm run dev:local`. Проверки: `npm test`, `npm run build`,
`npm --prefix apps/api run typecheck`, `npm --prefix apps/api run build`,
`node scripts/core-network-primitive-gate.mjs`, `node --test scripts/staff-mail.acceptance.cjs`,
`node scripts/guest-order-detail-lifecycle.browser.cjs`,
`VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/supply src/service-orders src/staff-auth`.
Ручная проверка: подтверждение/отказ, refresh после конфликта, RU/UZ/EN, темы/390px,
история после выезда и недоступность отмены начатой уборки. Полная PDF-приёмка не завершена.
Только disposable PostgreSQL; public web/Cloudflare/APK и реальные внешние операции не меняются.

Проверено на dirty `7b5867c`: web550/82files, выбранные Core supply/service-orders/staff-auth165/19files,
обе сборки/typecheck, network187/mail15,119 migration checksums и diff check PASS.
Полная connected browser chain exit0: потерянный ответ после настоящей отмены, прежний key/body,
один audit/outbox, folio0; stale409 без повторной отправки, ручной GET, checked_out скрывает действия.
RU/UZ/EN×Light/Dark×390px и lifecycle7reads PASS; независимое ревью PASS.
Red unit: missing helper и отсутствие revision validation; red browser на предыдущем dist
остановился на отсутствующей кнопке отмены. Новая сборка прошла все указанные проверки.
Следующий приоритет: reauthorization cached replay SQL0073 после lock wait, затем остальные действия.
