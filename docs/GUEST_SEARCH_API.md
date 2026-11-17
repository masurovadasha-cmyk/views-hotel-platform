# Локальный гостевой каталог

Сборка и проверка на одноразовой PostgreSQL:
```
npm run build
npm --prefix apps/api run build
node scripts/cloud-core-tests.cjs --dev-local --smoke --demo-sms --browser-smoke
```
Smoke включает только синтетический объект в catalog_properties и проверяет реальный API.
За пределами smoke таблица публикации пуста; active не означает публичный объект.
Не применяйте тестовый seed к постоянной базе.

GET /v1/guest-identity/sms/search?from=2037-10-01&to=2037-10-02&guests=2&city=Tashkent
требует Bearer SMS-сессию и local/test/quotes flags. Контракт: contracts/guest-search.openapi.json.
В ответе максимум50 вариантов, truncated требует сузить фильтры. Суммы — строки minor.
Цена базовая за ночь без сборов; наличие не гарантирует бронь. Нужны quote и hold.
Даты — местные даты объекта, демо-время14:00/12:00; занятые интервалы полуоткрытые.

Проверить вручную: названия/города, часовые пояса и часы заезда; правила явной публикации.
Ограничения: нет UI/guest proxy route, нового quote по датам, управления публикацией,
пагинации, нагрузки и production-доступа. Выпуск в публичный веб не выполнялся.
