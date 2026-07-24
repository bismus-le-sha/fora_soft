# prds/

Артефакты фич спецификационного пайплайна. По одной папке на фичу:

```
prds/
  <feature-name>/
    prd-<feature-name>.md      # PRD — вход пайплайна
    design-<feature-name>.md   # TDD (агент design-architect, /design)
    impl-<feature-name>.md     # Implementation Plan (агент task-planner, /plan)
```

Доработки версионируются суффиксом: `design-<feature>-v2.md`, `impl-<feature>-v3.md`.
Правила см. в `rules/prd-design.mdc` и `rules/prd-tasks.mdc`.
