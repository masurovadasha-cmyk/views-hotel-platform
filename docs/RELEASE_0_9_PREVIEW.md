# VIEWS 0.9.0-preview — веб и Android

Владелец запросил обновление опубликованных интерфейсов и APK. Эта версия
сохраняет границу **static-demo** для публичных сборок: рабочий PostgreSQL Core,
реальные email, платежи и документы гостей публично не включаются.

Обновлённый портал содержит пять направлений, включая «Закупки и склад», и
отдельные страницы входа девяти ролей сотрудников. В публичных страницах явно
указано, что email-вход не подключён. Выбор направления не выдаёт никаких прав.
Рабочие процессы Core, которые разрабатываются на той же ветке, требуют отдельной
локальной авторизации и не превращаются в работающий публичный backend после
публикации HTML. Описание рабочего блока: [04-staff-supply.md](stages-b/04-staff-supply.md).

## Идентичность приложения

| Поле | Значение |
| --- | --- |
| Web / Android version | `0.9.0-preview` |
| Android versionCode | `900001` |
| applicationId | `uz.views.preview` — сохранён |
| Подпись | Тот же существующий ключ VIEWS Preview, что в 0.8.0 |
| Минимальный Android | 8.0 / API 26 |
| Target SDK | 35 |
| Режим | `static-demo` |

Повышенный versionCode и прежние applicationId/сертификат позволяют подготовить
обновление установленной 0.8.0. Это не доказывает успешную установку поверх неё:
совместимость обновления нужно проверить на физическом устройстве. Ключ не
создаётся заново и не заменяется одноразовым ключом теста.

Независимый публичный SHA-256 сертификата предыдущего релиза:

```text
3a973f0de0333ced89769ddfdae476fe826da605910c952212bbfd1c8179e052
```

На момент подготовки проверено наличие прежних приватных файлов под
`/workspace/.views-preview-signing` и их права `0600`. Проверка метаданных keystore
нашла ровно один alias: `views-preview`. Пароли и приватный ключ не выводились.
Переменные подписания не установлены в текущем shell.

## Сборка после фиксации исходников

Сначала завершить согласованные изменения и проверки, зафиксировать исходники
одним проверенным commit и убедиться, что `git status --porcelain` пуст.
Нельзя подписывать APK, собранный с грязного или другого commit: signer отклоняет
такую сборку. `release.json` и `build-evidence.json` должны указывать тот же SHA.

Публичные веб-сборки выполняются последовательно, не одновременно в один `dist`:

```sh
npm run build:review
node scripts/access-portal.browser.cjs
npm run build:pages -- --outDir dist-pages
VIEWS_ACCESS_BUILD=dist-pages node scripts/access-portal.browser.cjs
npm run build:android
VIEWS_ACCESS_BUILD=dist-android node scripts/access-portal.browser.cjs
node scripts/android-review-web-proof.cjs
```

Все проверки должны завершиться успешно на окончательных исходниках. Для
автоматических тестов рабочих Core-интерфейсов нужна обычная сборка, а не review.

Android toolchain уже установлен; повторная загрузка не требуется:

```sh
export JAVA_HOME=/workspace/android-tools/java/jdk-21.0.12.1+1
export ANDROID_HOME=/workspace/android-tools/sdk
export PATH="$JAVA_HOME/bin:$PATH"
```

Проверено наличие исполняемых `javac`, `keytool`, `aapt2`, `d8`, `zipalign`,
`apksigner` и `apkanalyzer`, а также `platforms/android-35/android.jar`.
Если среда будет пересоздана, штатный установщик
`python3 scripts/setup-android-review.py` использует закреплённые checksum.

Перед упаковкой сохранить **весь прежний** `review-output` в отдельный архивный
каталог вне Git: там уже есть опубликованный APK 0.8.0 и подписанный candidate.
Не удалять их и не затирать старые свидетельства новым unsigned APK.
После сохранения предыдущих артефактов:

```sh
python3 scripts/build-android-review.py
python3 scripts/android-signing-proof.py
python3 scripts/sign-android-review.py --ack=REVIEW_APK_SIGNING
```

Signer требует пять переменных. Настроить их только в приватном процессе:

| Переменная | Источник |
| --- | --- |
| `VIEWS_ANDROID_KEYSTORE` | Существующий `/workspace/.views-preview-signing/preview.p12` |
| `VIEWS_ANDROID_KEY_ALIAS` | Существующий alias `views-preview`; не создавать новый |
| `VIEWS_ANDROID_STORE_PASSWORD_FILE` | Существующий приватный файл `password` в том же каталоге |
| `VIEWS_ANDROID_KEY_PASSWORD_FILE` | Прежний приватный файл пароля ключа; для этого preview использовался тот же файл |
| `VIEWS_ANDROID_CERT_SHA256` | Независимый публичный fingerprint выше |

Не печатать env, пароль или содержимое keystore в лог. При необходимости alias
можно получить через `keytool` с `-storepass:file`, захватив результат внутри
приватного процесса, без вывода данных подписания. Проверить, что найден ровно
один подходящий ключ; неоднозначность не разрешать выбором случайного alias.

Публикуемый файл после всех проверок — копия `VIEWS-Review-candidate.apk` с именем
`VIEWS-0.9.0-preview.apk`. Вместе с ним подготовить `SHA256SUMS.txt` именно для
подписанного файла и `signing-evidence.json`. Unsigned APK не публиковать как
установочный. Повторно выполнить `apksigner verify` и `zipalign -c`; сравнить
версию, applicationId, source SHA и fingerprint с ожидаемыми значениями.

## Публикация и внешнее подтверждение

Основная ветка не объединяется с этой работой. Окончательный исходный commit
должен быть сохранён в feature-ветке и явно выбран для публичного staging.
Перед обновлением `staging/master-reference-v1` проверить удалённый SHA и
возможность обычного fast-forward; не применять force-push.

Текущий Pages workflow запускается по push в `staging/master-reference-v1`.
Cloudflare connected build и GitHub Pages — независимые развертывания. Зелёная
GitHub job с пропущенным Cloudflare deploy не подтверждает публикацию в Cloudflare.
После развертывания прочитать публичный `release.json`, сопоставить clean source
SHA и версию, затем открыть страницы ролей и направление снабжения.

Автоматическая проверка опубликованных файлов:

```sh
node scripts/public-release.browser.cjs https://masurovadasha-cmyk.github.io/views-hotel-platform/ FINAL_40_HEX_SOURCE_SHA
node scripts/public-release.browser.cjs https://staging-master-reference-v1-views-hotel-platform.masurovadasha.workers.dev/ FINAL_40_HEX_SOURCE_SHA
```

Заменить `FINAL_40_HEX_SOURCE_SHA` окончательным commit. Скрипт скачивает файлы
через curl с обычной проверкой TLS и отрисовывает именно эти ответы в Chromium.
Обход проверки сертификатов не используется. Проверяются опубликованная версия,
чистый SHA, пять карточек, девять страниц ролей и отключённый публичный вход.
Это браузерная отрисовка скачанных файлов, а не прямое TLS-соединение Chromium.

Для APK предыдущий рабочий путь публикации использовал отдельную ветку
`release-artifacts/v0.8.0-preview` и workflow `publish-signed-preview.yml`.
Прямой upload из workspace ранее возвращал HTTP 401. Прежний workflow жёстко
привязан к старому tag, checksum и source SHA, поэтому запускать его для нового
APK без изменения нельзя.

После получения окончательного подписанного APK подготовить отдельную ветку
`release-artifacts/v0.9.0-preview` с публичными артефактами и адаптированным
workflow. Проверки должны закреплять новый APK checksum, окончательный source
SHA и `0.9.0-preview`; сертификат остаётся прежним. Workflow сверяет checksum,
подпись, встроенный `release.json`, `sourceDirty=false` и отключённый публичный
Core/email, затем загружает артефакты в заранее созданный draft prerelease
`v0.9.0-preview`. Приватные файлы подписи в эту ветку не попадают.

После публикации скачать APK заново из публичного release и проверить SHA-256.
Одна успешная загрузка артефакта не заменяет проверку доступности публичной ссылки.

## Приёмка и статус

Итоговый clean source SHA, проверки, URL и checksum фиксируются после выполнения
в примечаниях GitHub Release v0.9.0-preview и публичном release.json. Этот runbook
описывает процедуру и не заменяет доказательства фактической публикации.
Код частичной приёмки и инвентаризации проверен: Core476/83, root299/53,
6сквозных браузерных групп склада; подробности в CURRENT_DELIVERY_STATUS.md.

На физическом Android проверить установку поверх 0.8.0, холодный старт, портал
с пятью направлениями, девять страниц ролей, три языка, тёмную тему, навигацию
назад и повторный запуск без сети. Проверить, что интерфейс не обещает отправку
письма или работу публичного Core. Браузерный тест Android assets не является
тестом нативного WebView, эмулятора или физического телефона.
