# Canva22 — публичная история возврата сборки на согласование

SG-MK-004/SD-MK-002/SS-MK-001: гость и склад видят одинаковые причины и серверное время возвратов заказа на согласование. В форме причина явно помечена как видимая гостю. Имена, user/membership ID и внутренний payload команды не публикуются.

Критерии: серверные at/note; replay не добавляет запись; последние20 newest-first с общим счётчиком; гостевая projection пропускает только публичные поля; RU/UZ/EN; старые записи без disclosure не раскрываются.

Migration0107 добавляет в market_orders reopen_history (bounded jsonb) и reopen_count. Запись добавляется в той же транзакции, что stage/revision/checklist/audit/outbox. CHECK ограничивает массив20 и проверяет count. Права/RLS таблицы не меняются. market_receipt возвращает историю для существующих scoped списков; guest gateway удаляет actor fields. Полный внутренний audit/command registry остаётся отдельным.

История начинается с применения миграции; старые причины не переносятся, поскольку ранее сотруднику не сообщалось об их публикации гостю. Счётчик также относится только к новому журналу. Связанный заказ-преемник не наследует историю: она остаётся в исходной карточке. Время явно UTC до добавления timezone объекта в этот контракт.

## Запуск
```sh
npm run build
npm --prefix apps/api run typecheck
npm --prefix apps/api run build
npm test
VIEWS_GUEST_EMAIL_HTTP_PROOF=true VIEWS_GUEST_EMAIL_BROWSER_PROOF=true node scripts/cloud-core-tests.cjs src/service-orders
```
Runner использует одноразовую PostgreSQL16/synthetic fixtures. Постоянную views_local не сбрасывать.

Ручные проверки: указать публичную причину, вернуть сборку на согласование, обновить кабинет гостя, сравнить текст и время; повторить запрос с тем же ключом; проверить22 возврата: count22 и20 записей. Проверить RU/UZ/EN, обе темы, узкий экран и длинную причину. Не вводить в публичную причину внутренние заметки/секреты.

Ограничения: нет фото/партий, не реализован экспорт полной истории гостю, полная PDF-приёмка открыта; public web/APK не публикуются.

Проверено на dirtybe4d1ba: service-orders85 и web381 PASS; typecheck/build API+web, network187/mail15 PASS. Browser V Market сверяет публичный текст, одну запись и datetime в обоих кабинетах. Полный Light/Dark/PDF-аудит новой истории не заявлен. Проверка старой gateway projection с корректным receipt воспроизводит отсутствие истории; новая проходит regression test.
