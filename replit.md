# Twitch AI Bot

ИИ-бот для Twitch, который наблюдает за CS2-стримами, читает чат и пишет сообщения, неотличимые от живого русского зрителя.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — запустить API сервер (порт 8080)
- `pnpm run typecheck` — полная проверка типов
- `pnpm run build` — typecheck + сборка
- `pnpm --filter @workspace/api-spec run codegen` — перегенерировать API хуки и Zod схемы из OpenAPI spec
- `pnpm --filter @workspace/db run push` — применить изменения схемы БД (только dev)
- Required env: `DATABASE_URL` — строка подключения к Postgres

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (из OpenAPI spec)
- Frontend: React + Vite + shadcn/ui + TanStack Query + Wouter
- AI: OpenAI GPT-4o-mini (генерация сообщений), Whisper (аудио), Gemini 2.0 Flash (vision)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — источник истины для API контракта
- `lib/db/src/schema/` — схемы Drizzle: `settings.ts`, `patterns.ts`, `logs.ts`, `messages.ts`
- `artifacts/api-server/src/lib/bot-engine/` — ядро бота (orchestrator, pattern-learner, response-generator, twitch-irc, vision-analyzer, context-builder)
- `artifacts/api-server/src/lib/cs2-ru-streamers.ts` — пресеты топовых рус. CS2 стримеров
- `artifacts/api-server/src/routes/` — Express роуты (bot, settings, logs, messages, patterns, stats)
- `artifacts/dashboard/src/pages/` — страницы дашборда (dashboard, logs, messages, patterns, settings)
- `DEVLOG.md` — журнал разработки: что сделано, что предстоит

## Architecture decisions

- Бот работает на сервере, дашборд только читает состояние через REST API (polling каждые 3с)
- Паттерны хранятся в Postgres с полями `language` и `game` — приоритет русскому CS2-чату
- `shouldRespond()` вызывается каждые 15с через GPT-4o-mini — экономит токены, не блокирует
- IRC-подключение: anonymous (`justinfan`) для чтения, authenticated (OAuth) для отправки
- Gemini 2.0 Flash для vision (дешевле GPT-4V), OpenAI Whisper для audio
- Anti-detect: рандомные задержки + 15% шанс промолчать + симуляция опечаток (18% сообщений)
- Response generator инжектирует до 20 реальных паттернов прямо в системный промпт (30% шанс)

## Product

- Dashboard: статистика, live telemetry, история сообщений
- Live Logs: все события бота в реальном времени
- Messages: история всех отправленных сообщений с контекстом
- Patterns: обучение на реальном чате русских CS2 стримеров (массовое и поканальное)
- Settings: личность бота, API ключи (OpenAI/Gemini/Twitch OAuth), тайминги

## User preferences

- Записывать каждый шаг разработки в DEVLOG.md
- Обучение максимально на русских CS2 стримерах — наивысший приоритет
- Цель: бот неотличим от живого зрителя, никакого детекта

## Gotchas

- После изменения OpenAPI spec ОБЯЗАТЕЛЬНО: `pnpm --filter @workspace/api-spec run codegen`
- После изменения DB schema ОБЯЗАТЕЛЬНО: `pnpm --filter @workspace/db run push`
- После codegen typecheck:libs запускается автоматически
- `pnpm run dev` из root НЕ работает — используй `restart_workflow`
- Seed данные в БД имеют `language: 'ru'` и `game: 'cs2'` по умолчанию (из-за DEFAULT в схеме)

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `DEVLOG.md` — подробный журнал спринтов и бэклог
