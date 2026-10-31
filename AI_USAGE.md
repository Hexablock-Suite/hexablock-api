# AI Usage

## Tools Used

TODO: list each AI tool, its version or model, and what the team used it for.

## Usage Log per Task

TODO: add one entry per task: date, task, tool, prompt summary, what was kept and what was changed.

| Date       | Task                                                                                | Tool        | What the AI produced                                                                                                                                                                                                                                                                                                                                                                                                                                      | What the team changed |
| ---------- | ----------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 2026-10-31 | E1 and E2: backend layer and class diagrams                                         | Claude Code | Moved the ports to `src/application` in `docs/architecture/layers.md` (Q10). Drew the class diagram in `docs/architecture/classes.md` with ten views. Closed DS-5, DS-6 and Q10 in `docs/REQUIREMENTS.md`.                                                                                                                                                                                                                                                | pending team review   |
| 2026-10-31 | Line notation of the class and extensibility views (course notation)                | Claude Code | Redrew the relationship lines of 13 views: attributes as diamonds with their name and multiplicity, uses as solid arrows with a verb, realizations with a hollow triangle; new legends; the notation bullets of `classes.md` and `extensibility.md`                                                                                                                                                                                                       | Pending team review   |
| 2026-10-31 | Design review fixes: Clock port, progress aggregate, level validators, HTTP mappers | Claude Code | Moved `Clock` to `src/application/ports` (the domain takes the instant as a parameter) and added a contract suite for `FixedClock` and `SystemClock`. Made `PlayerProgress` the aggregate root of its level results, returned a `Result` from `UpdateLevels`, registered level validators by game, took the Fit rotation from the topology, added the HTTP DTO mappers (view 3.5), removed the `Logger` port, and named `AppModule` the composition root. | pending team review   |
| 2026-10-31 | Design review fixes: view notation, layer colors and the concentric layer view      | Claude Code | Typed the parameters of every method in the views, labelled the bound generics with «bind», removed the guard and CREATES lines that were not uses, drew the section of `LevelDefinition` as aggregation, colored the application purple and the infrastructure blue with the legend inside each drawing, added the concentric view `layers/views/layers-1-rings`, and removed the citations of class recordings from the docs.                           | pending team review   |

## Critical Evaluation

TODO: record where AI output was wrong or weak, how the team caught it, and what the team learned.
