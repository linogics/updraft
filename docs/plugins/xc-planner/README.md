# XC planner plugins

An `xc-planner` plugin adds export buttons to the XC planner (`/plan`) and XC scoring leagues. Each export is one file format a planned route is written to. A plugin gives `exports`, `leagues` or both.

- Where it runs: exports in the XC planner. Leagues apply app wide.
- How to load it: **Add plugin** in the planner's Panels menu. The planner takes `studio` and `xc-planner` plugins.
- Reference: [API reference](api.md).

## Fields

`apiVersion` is `1`. Every field of [every kind](../README.md#module-contract) applies as well.

| Field        | Type            | Rule                                                                                                          |
| ------------ | --------------- | ------------------------------------------------------------------------------------------------------------- |
| `kind`       | `'xc-planner'`  | Required.                                                                                                     |
| `apiVersion` | `1`             | Required.                                                                                                     |
| `exports`    | `PlanExport[]`  | Optional, 1 to 10 task file formats. Extensions must be unique within the plugin.                             |
| `leagues`    | `PlanLeague[]`  | Optional, 1 to 20 scoring leagues. At least one of `exports` and `leagues` is needed.                         |

Validation messages:

- `Unsupported apiVersion X, xc-planner plugins support 1.`
- `"exports" must be a list of 1 to 10 task file formats, or "leagues" must be given.`
- `Every export must be an object.`, `Every export needs a non-empty "label".`, `Every export needs a "write" function.`
- `Every export "extension" must be lower case, 1 to 10 characters from a-z and 0-9.`
- `An export "mime" must be a non-empty string.`
- `The export extensions of one plugin must be unique.`
- League messages are listed under [Leagues](#leagues).

## Exports

- `exports` has 1 to 10 entries. `label` is not blank and names the button. `extension` is lower case, without the dot, 1 to 10 characters from `[a-z0-9]`, and unique within the plugin. Other plugins may reuse an extension, the label tells the buttons apart. `mime` defaults to `application/octet-stream`.
- `write(route)` gets `{ points, speed }` with at least 2 turnpoints and the speed in km/h. It is a fresh copy, changing it has no effect. It returns a string (stored as UTF-8) or a `Uint8Array`. An error it throws is shown under the buttons.
- The bundled `updraft/tasks` plugin provides the XCTrack task and the GPX route and cannot be removed.
- The bundled `updraft/leagues` plugin provides the seven built-in leagues and cannot be removed.
- A route suggestion is not an export. Use a [studio plugin](../studio/README.md#the-xc-planner-host) with `hosts: ['plan']` that calls `setRoute` of `updraft/plan@1`.

## Leagues

A league is plain data, so scoring never runs plugin code. The app maps the rules onto the igc-xc-score solver in a worker.

- `leagues` has 1 to 20 entries. `id` is unique within the plugin and matches `[a-z0-9-]{1,40}`. `label` is not blank and shows in the league pickers. `rules` has 1 to 10 entries and the best scoring one wins.
- The app stores the league as `<plugin id>:<league id>`, for example `acme/club-league:club`. The bundled leagues keep their plain ids, for example `XContest`.
- A league applies app wide: logbook scores, studio XC panel, club stats, the planner and the `league()`, `leagues()` and `setLeague()` of `updraft/studio@1` and `updraft/plan@1`. The league data is stored when the plugin is added and the plugin is not imported for scoring.
- When the plugin is removed while its league is chosen, the app uses `XContest`. A shared club flight scored with a league this browser does not know shows the league id instead of a label.
- Cached scores of a plugin league are keyed by its rules, so changing the rules scores again.

Rule fields, all distances in km:

| Field         | Meaning                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`        | Shown to the user. Not blank.                                                                                                                                                    |
| `type`        | `free` distance via 3 turnpoints, `flat` triangle, `fai` FAI triangle, `oar` out-and-return via 1 turnpoint, `oar2` via 2 turnpoints.                                            |
| `multiplier`  | Points per km, above 0 and at most 10.                                                                                                                                           |
| `minSide`     | Shortest triangle side as a share of the total, above 0 and below 0.5. `flat` and `fai` only, `fai` defaults to 0.28.                                                            |
| `maxSide`     | Longest triangle side as a share of the total, above `minSide` and at most 1. `flat` only.                                                                                       |
| `minDistance` | Shortest route that scores, 0 to 1000.                                                                                                                                           |
| `closing`     | `{ fixed, free, relative }`, not for `free`. The allowed gap is max(`fixed`, `relative` * route length). `free` is gap without penalty. `fixed` and `free` are 0 to 100, `relative` 0 to 1. |
| `cylinders`   | FAI cylinder radius, 0 to 5. Turnpoints are moved out by it.                                                                                                                     |
| `decimals`    | Decimals of the final score, 1 or 2, default 2.                                                                                                                                  |

League validation messages:

- `"leagues" must be a list of 1 to 20 leagues.`
- `Every league "id" must be 1 to 40 characters from a-z, 0-9 and "-".` and `The league id "x" is used twice.`
- `League "x" needs a non-empty "label".`
- `League "x": "rules" must be a list of 1 to 10 rules.`
- Per rule: a missing `name`, a `type` that is not one of `free, flat, fai, oar, oar2`, a `multiplier` outside its range, `"minSide" is only for flat and fai rules.`, `"maxSide" is only for flat rules.`, `"maxSide" must be above "minSide".`, `"closing" is not for free rules.`, a number outside its range, `"decimals" must be 1 or 2.`

## Examples

- [examples/csv-route.js](examples/csv-route.js) adds one export button, **CSV turnpoints**. `write(route)` joins `lat,lon` of every turnpoint, one per line.
- [examples/club-league.js](examples/club-league.js) adds the league `club` with two rules. Free distance scores 1 point per km. The FAI triangle scores 2 points per km and allows a closing gap of 5 percent of the route length. The app stores it as `acme/club-league:club`.

The test `src/lib/plugins/examples.test.ts` checks that both validate.
