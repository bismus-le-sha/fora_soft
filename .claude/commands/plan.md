---
description: Составить Implementation Plan по PRD и TDD фичи
argument-hint: <feature-name>
---

Запусти агента `task-planner`, чтобы составить Implementation Plan.

Фича: $ARGUMENTS

Агент должен:
- следовать правилам из `rules/prd-tasks.mdc`;
- прочитать `prds/<feature-name>/design-<feature-name>.md` и
  `prds/<feature-name>/prd-<feature-name>.md`;
- разбить работу на атомарные задачи (0.25–1 день, один MR/PR каждая);
- сохранить результат в `prds/<feature-name>/impl-<feature-name>.md`.

Если TDD для фичи ещё нет — сначала предложи запустить `/design`.
