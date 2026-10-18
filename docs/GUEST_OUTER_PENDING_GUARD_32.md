# Срез32 — сохранение неподтверждённых команд гостя

Критерии:
1. Пока команда услуги/отмены выполняется или её результат неизвестен, выход,
   проверка сессии и preview/accept привязки брони заблокированы в UI и обработчиках.
2. Ранее начатая проверка сессии/привязка временно блокирует действия поездки;
   поздний результат привязки не размонтирует ещё неподтверждённую команду.
3. Черновик приглашения, тело команды и ключ повтора сохраняются при offline;
   после разрешения операции внешние действия снова доступны.
4. События/cleanup старой сессии или поездки не сбрасывают pending новой;
   обычный rerender и StrictMode не теряют состояние.
5. Реальный отказ авторизации по-прежнему очищает соответствующую сессию;
   guard не выдаёт доступ и не заменяет серверную авторизацию.
6. Проверены RU/UZ/EN, мобильный экран и обе темы без новых зависимостей.

Решение: session/trip-scoped guard в памяти, агрегирование существующих pending-флагов,
взаимная блокировка внешних запросов и поездки, однократное отложенное обновление списка.
Используются прежние API и миграции до0122 включительно; схема/права/платежи не меняются.
Это защита переходов внутри приложения: браузерное закрытие/reload не даёт гарантии
сохранения команды; существующий beforeunload только предупреждает. Durable recovery отдельно.

Запуск synthetic-среды: `npm run dev:local`.
Проверить вручную: потеря ответа заказа/отзыва → внешние действия недоступны → offline →
ручной повтор того же ключа → одна запись и разблокировка; поздний ответ привязки;
отзыв сессии и повторный вход. Блокирующих вопросов нет.
Проверки: `npm test`, `npm run build`, API `npm run typecheck && npm run build`,
`node scripts/core-network-primitive-gate.mjs`, `node --test scripts/staff-mail.acceptance.cjs`.
Focused Core/browser:
`VIEWS_CLEANING_BROWSER_ONLY=true VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/supply src/service-orders src/staff-auth`.
Полная browser chain:
`VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/service-orders/service-order.integration.test.ts`.

Dirty `4c7fef6`: web557/83files, Core197/22files, обе сборки/typecheck, network187/mail15,
122checksum PASS (exit0). Red browser на прежней сборке упал на доступном Sign out
при удержанном ответе после коммита; unit red — отсутствующий guard (0тестов), затем7PASS.
Focused browser exit0: реальные preview/session barriers, сохранённые приглашение/черновик,
нет внешних запросов при pending, повтор с прежними ключом/телом, один заказ/отзыв;
реальный logout → retry401 очищает identity/trips и показывает вход.
Полная browser chain exit0:16подготовительных Core-тестов и16структурированных proofs PASS;
отмена брони,4услуги, детали, фолио, склад, входы; RU/UZ/EN, темы/mobile/offline в сценариях.
Ревью обнаружило и закрыло initial-load delay и поздний ответ авторизации; независимое review PASS.
Поздние callbacks проверены unit; StrictMode cleanup проверен анализом, отдельный dev-browser не запускался.
Все данные synthetic, SMTP loopback; public web032ea93/Cloudflare/APK и Canva56partial/84pending без изменений.
Следующий срез: отмена заявки прачечной из общей карточки с проверкой доступа и безопасным повтором.
