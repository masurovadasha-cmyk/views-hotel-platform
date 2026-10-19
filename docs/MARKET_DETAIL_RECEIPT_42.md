# Срез42 — получение V Market из общей карточки

Критерии до реализации: handed_over без open issue; явное согласие; точная проверка ID/revision/суммы/валюты; неизменный ключ при неизвестном результате; RU/UZ/EN, темы и offline. Checkout не запрещает получение по существующим правилам Core. Основа:56375a5, SQL0125 без изменений.

Реализация: отдельная GuestMarketReceive, контракт guest-market-receipt, подключение к существующему useCleaning в GuestOrderDetail. Ожидаемая сумма/валюта остаются вне тела запроса; сохраняются с командой в памяти. Проверяется полная проекция товара. Сервер остаётся источником прав и начисления; миграции и зависимости не нужны.

## Запуск проверок
```sh
npm run build
npm test
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/service-orders/market.integration.test.ts src/service-orders/market-receipt-replay.integration.test.ts src/staff-auth
node scripts/core-network-primitive-gate.mjs
node --test scripts/staff-mail.acceptance.cjs
```
База только disposable PostgreSQL16, SMTP только loopback. RED: контрактный файл отсутствовал,0tests; это не доказательство воспроизведённой финансовой ошибки.

## Риски и ручная приёмка
Проверить состав/сумму, согласие и отсутствие действия при открытой претензии или завершении; три языка, темы и узкий экран. При потере ответа — ручной повтор той же команды, при конфликте — обновить карточку. Полная перезагрузка вкладки теряет in-memory retry: восстановление после hard reload остаётся отдельной задачей. Остальные действия V Market требуют собственного аудита. Реальные платежи, внешняя почта и публичный выпуск не выполняются; Canva-приёмка не заявляется.

Проверен dirty-source поверх56375a5: web942/90files (37новых), Core71/6files; web/APIbuild/typecheck, network187без findings, mail15,125checksum PASS. Новый proof проверил фактический commit с потерей ответа и неизменным retry, ровно одну charge/audit/outbox. Созданы6снимков RU/UZ/EN×Light/Dark×390; RU Light/Dark иUZ Dark просмотрены.

Полная HTTP/browser цепочка завершилась exit0:23proofs PASS, включая новый guest_market_detail_receipt_core.
