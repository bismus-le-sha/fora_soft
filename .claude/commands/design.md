---
description: Составить Technical Design Document (TDD) по PRD фичи
argument-hint: <feature-name или путь к PRD>
---

Запусти агента `design-architect`, чтобы составить Technical Design Document.

Фича/PRD: $ARGUMENTS

Агент должен:
- следовать правилам из `rules/prd-design.mdc`;
- прочитать PRD из `prds/<feature-name>/prd-<feature-name>.md`;
- изучить существующий код и задать уточняющие вопросы при пробелах;
- сохранить результат в `prds/<feature-name>/design-<feature-name>.md`.

Если `$ARGUMENTS` пуст — уточни, для какой фичи готовим дизайн.
