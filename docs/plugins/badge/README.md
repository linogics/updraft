# Badge plugins

A `badge` plugin adds tiered achievements. Each badge reads the summaries of a pilot's flights and returns one number. The tier is the highest threshold that number reaches.

- Where it runs: in the logbook Achievements panel and the club badges tab. Every track flight of the logbook counts, manual entries and demo flights do not. `maxAgl` is only set for flights shared with the club, because terrain heights are not fetched for the whole logbook.
- How to load it: **Add badge plugin** at the bottom of the logbook Achievements panel. That panel only takes badge plugins. **Uninstall** removes it.
- Reference: [API reference](api.md).

## Fields

`apiVersion` is `1`. Every field of [every kind](../README.md#module-contract) applies as well.

| Field        | Type          | Rule                                                      |
| ------------ | ------------- | --------------------------------------------------------- |
| `kind`       | `'badge'`     | Required.                                                 |
| `apiVersion` | `1`           | Required.                                                 |
| `badges`     | `BadgeDef[]`  | Required. 1 or more, ids unique within the plugin.        |

A badge:

| Field        | Type                          | Rule                                                                                                                                                              |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | `string`                      | Unique within the plugin, 1 to 40 characters from `[a-z0-9-]`.                                                                                                    |
| `label`      | `string`                      | Not blank. Shown to the user.                                                                                                                                     |
| `unit`       | `BadgeUnit`                   | One of `distance`, `speed`, `duration`, `altitude`, `vario` or `count`. It tells the app how to display the number.                                                |
| `thresholds` | `number[]`                    | Exactly 8 finite numbers above 0, each larger than the one before. The tiers Bronze, Silver, Gold, Platinum, Diamond, Cloudbase, Stratos and Legend, in that order. |
| `value`      | `(flights: BadgeFlight[]) => number` | Required. The badge value over all flights of a pilot.                                                                                                     |

Validation messages:

- `Unsupported apiVersion X, badge plugins support 1.`
- `"badges" must be a list of 1 or more badges.` and `Every badge must be an object.`
- `Every badge "id" must be 1 to 40 characters from a-z, 0-9 and "-".` and `The badge id "x" is used twice.`
- `Badge "x" needs a non-empty "label".`
- `Badge "x": "unit" must be one of distance, speed, duration, altitude, vario, count.`
- `Badge "x": "thresholds" must be 8 finite numbers above 0, each larger than the one before.`
- `Badge "x" needs a "value" function.`

## Behaviour

- Everything is SI: metres, m/s, seconds, or a plain count. The app converts for display only.
- `value(flights)` gets every flight summary of a pilot, in any order, as `BadgeFlight` objects with `date`, `site`, `glider`, `durationS`, `freeDistance`, `maxAltMsl`, `maxGain`, optional `maxAgl`, `bestClimb`, `bestThermalGain` and an optional `xc` of `{ kind, distance, speed? }`. It returns a finite number of 0 or more. A throw or an invalid result counts as 0.
- `site` and `glider` may be null, blank or differ in case between flights.
- `value` must never drop when a flight is added, like a maximum, a sum or a count. The app finds the date a tier was reached by asking for the value of the flights up to a day.
- The app keeps the badge list (id, label, unit, thresholds) when the plugin is added. The `value` functions are imported when badges are evaluated.
- The bundled `updraft/badges` plugin provides 15 badges and cannot be removed.

## Example

[examples/long-flights.js](examples/long-flights.js) defines one badge, `long-flights`, with the unit `count`. `value` counts the flights of an hour or more (`durationS >= 3600`). A count never drops when a flight is added. The eight thresholds go from 1 flight (Bronze) to 500 flights (Legend).

The test `src/lib/plugins/examples.test.ts` checks that it validates.
