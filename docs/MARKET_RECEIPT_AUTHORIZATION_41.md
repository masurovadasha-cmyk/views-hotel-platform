# Срез41 — авторизация получения V Market

2026-10-19, Asia/Tashkent; исходник `3b34808`. Перед добавлением кнопки выявлены ранний cached replay в0084/0112 и отсутствие повторной проверки сессии после ожидания фолио/заказа. UI откладывается в следующий небольшой срез.

## Критерии до кода

1. Свежий и cached confirm_receipt после logout/unlink/reassign во время ожидания команды отклоняются без изменения заказа, склада, начислений, audit/outbox.
2. Logout после ожидания профиля, товара, фолио и позднего UPDATE заказа откатывает свежую команду целиком; cached ответ требует актуального доступа.
3. Разрешённый повтор сохраняет исходную квитанцию и одно точное bigint начисление, включая checkout; изменённый payload конфликтует.
4. Старая последовательность блокировок, формат API/квитанции, финансовые правила и права сохраняются; новые функции закрыты от прямого runtime-вызова.
5. Исправление ограничено гостевым confirm_receipt. Остальные команды V Market, публичный веб/APK и постоянная база не меняются.

Используется отдельная функция получения и совместимый dispatch прежнего app.market_guest_act. Только disposable PostgreSQL/loopback SMTP. Глобальная атомарность logout после последней проверки не заявляется; остальные команды требуют отдельного аудита.

## Проверка и запуск

Проверен dirty-source поверх `3b3480868789728c1d6e14fdbe142367eea20c1d`, без изменения прежних124 миграций. RED доSQL0125:8failed/8passed; исправлен отдельно тестовый item-lock (runtime не имеет UPDATEpolicy на immutable supply_items), повтор RED подтвердил дефекты. GREEN:17целевых сценариев, включая private ACL; полный выбранный Core253/24files PASS.

Из корня репозитория с установленными зависимостями:
```sh
node scripts/cloud-core-tests.cjs src/supply src/service-orders src/staff-auth
npm run build
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
npm test
node scripts/core-network-primitive-gate.mjs
node --test scripts/staff-mail.acceptance.cjs
VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/service-orders/market.integration.test.ts
```
Runner создаёт только помеченную disposable PostgreSQL16 и loopback SMTP. Не применять его fixture/setup к постоянной базе. Из `db/migrations`: `sha256sum --check ../migrations.sha256` —125PASS; прежние checksum сохранены. Web905/89files, web/APIbuild/typecheck, network187 без findings, mail15PASS (exit0).

## Риски и ручная приёмка

- Проверить существующий экран получения: повтор запроса даёт прежнюю квитанцию и одно начисление; открытая претензия запрещает подтверждение.
- После отзыва сессии/перепривязки гостя не показывать успешное получение по старому ответу; новая кнопка общей карточки ещё не добавлена.
- Проверить migration0125 на копии эксплуатационной схемы перед выпуском; production/провайдеры/реальные деньги не проверялись.
- Прочие команды V Market требуют самостоятельного аудита гонок; исправление ограничено confirm_receipt. Public032ea93, APK, Cloudflare и статус Canva не обновлялись.

Сквозная команда выше: exit0,24подготовительных Core tests и22HTTP/browser proofs PASS, включая существующий сценарий V Market; новой UI нет.
