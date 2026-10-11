# M0d.6 — Expo shell

Критерии: отдельный mobile workspace; guest/staff profiles с разными app IDs;
ru/uz/en через shared; явный disconnected preview; типы и локальный Android JS export;
существующие клиенты проходят проверки без смены React.

Expo57.0.27, React19.2.3 и RN0.86.3 согласованы по bundledNativeModules.json
официального npm-пакета Expo. Новые зависимости нужны для native runtime/Metro;
React18 веб-приложений сохраняется. Generated lock учитывается отдельно от ручного кода.

После frozen pnpm10.18.3 install из корня:
`pnpm --filter @views/mobile typecheck`; `pnpm --filter @views/mobile build`.
Staff bundle: `EXPO_PUBLIC_APP_MODE=staff pnpm --filter @views/mobile build`.
iOS JS: `pnpm --filter @views/mobile build:ios`.
Build scripts очищают Metro cache: профиль задаётся до экспорта, чтобы не переиспользовать guest bundle при staff.
Проверка Linux: `node scripts/mobile-bundle-proof.cjs apps/mobile/dist /tmp/views-staff-export`
после staff export в указанный каталог с --clear. Proof дизассемблирует Hermes через
компилятор RN и проверяет фактический Guest/Staff заголовок App; одних разных хешей недостаточно.
Metro: `EXPO_NO_TELEMETRY=1 pnpm --filter @views/mobile dev` (localhost).
`node --test scripts/mobile-config.acceptance.cjs` проверяет profiles и отказ неизвестного mode.

Android/iOS JS export не является APK/IPA или доказательством работы на устройстве.
EAS profiles guest-preview/staff-preview подготовлены, но облачные builds не запускать
без отдельного разрешения на аккаунт/расходы/подпись. Expo Go не критерий готовности.
Нет логина, API, платежей, push или настоящих данных. Mode не выдаёт права.
Цвета native shell пока локальные; общий RN adapter дизайн-токенов не завершён.

Вручную на development build: оба профиля,3 языка, крупный шрифт, safe areas,
клавиатурная/экранная навигация. Native device/emulator acceptance отдельным срезом.
Публичные веб/APK и постоянная БД не меняются. M0 ещё открыт.

Известный блокер выпуска: prod audit текущего lock сообщает2 high +1 moderate.
High: node-forge (GHSA-86w9-cpqp-85rv) через Expo CLI и braces
(GHSA-vfj7-8cjw-p6xm) через Metro. Реестр не указывает исправленные версии.
Audit gate в CI сохранён и будет блокировать выпуск; это не production-ready SDK
acceptance. Не добавлять audit ignore или неподтверждённый security patch ради зелёного CI.
Следующий security-срез: проверить официальные исправления/совместимый SDK и повторить audit.
