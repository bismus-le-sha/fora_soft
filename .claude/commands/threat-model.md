---
description: Построить продуктовый security-baseline (модель угроз) по PRD — разово, до дизайна
argument-hint: <feature-name или путь к PRD>
---

Запусти агента `security-auditor` в режиме **threat model**.

Вход (фича/PRD): $ARGUMENTS

Агент должен:
- прочитать PRD (`prds/<feature-name>/prd-<feature-name>.md`);
- построить модель угроз (STRIDE), описать активы, границы доверия, authN/authZ,
  защиту данных, риски зависимостей;
- сформировать **чек-лист требований безопасности** для будущих TDD и PR;
- сохранить результат в `security/security-baseline.md`.

Это разовый шаг перед `/design`. Если baseline уже есть — предложи обновить/дополнить.
