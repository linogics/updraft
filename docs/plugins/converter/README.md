# Converter plugins

A `converter` plugin teaches the app one track file format. It can read files (`read`), write them (`write`), or both. The app converts through its own flight model, so a plugin never talks to another format directly. Anything `PluginTrack` has no field for is lost.

- Where it runs: wherever the app opens or writes track files, the converter page and the logbook and studio import.
- How to load it: **Add format** on the converter page. That page only takes converter plugins.
- Reference: [API reference](api.md).

## Fields

`apiVersion` is `1`. Every field of [every kind](../README.md#module-contract) applies as well.

| Field        | Type                                                    | Rule                                                                                                                                 |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `kind`       | `'converter'`                                           | Required.                                                                                                                            |
| `apiVersion` | `1`                                                     | Required.                                                                                                                            |
| `label`      | `string`                                                | Required. Format name shown to the user, for example `IGC`. Not blank.                                                               |
| `extensions` | `string[]`                                              | Required. Lower case, without the dot, 1 to 10 characters from `[a-z0-9]`, no duplicates. The first one is used for written files.   |
| `mime`       | `string`                                                | Optional, not blank. Media type of written files. Defaults to `application/octet-stream`.                                            |
| `read`       | `(file: File) => PluginTrack \| Promise<PluginTrack>`   | Optional.                                                                                                                            |
| `write`      | `(track: PluginTrack) => string \| Uint8Array`          | Optional. At least one of `read` and `write` is needed.                                                                              |

Validation messages:

- `Unsupported apiVersion X, converters support 1.`
- `"label" must be a non-empty string.`
- `"extensions" must be a list of unique lower case extensions, 1 to 10 characters from a-z and 0-9.`
- `"mime" must be a non-empty string.`
- `"read" must be a function.` and `"write" must be a function.`
- `A converter must have "read" or "write".`
- `The extension ".x" is already handled by NAME.` when another converter, bundled or added earlier, handles it.

## Behaviour

- Readers run wherever the app opens track files. Writers appear in the converter page's target list and write with the first extension.
- `read` gets a `File` and returns a `PluginTrack`, or a promise of one. Throw an `Error` with a message for the user when the file is not valid.
- The app checks every reader result: `date` is `YYYY-MM-DD`, there is at least one fix, all numbers are finite, `lat` and `lon` are in range and `t` never decreases. It copies the fields it knows and assigns `id` and the file name itself. A bad result becomes an error for that file.
- `write` returns a string (stored as UTF-8) or a `Uint8Array`.
- Times are Unix ms, altitude is in metres and positions are in degrees.
- The bundled formats (IGC, GPX, KML, GeoJSON, TRK, FIT) are converters too and cannot be removed.
- Users remove converters on the converter page.

## Example

[examples/csv.js](examples/csv.js) reads and writes a plain CSV with the columns `t, lat, lon, alt` and no header.

- `label`, `extensions: ['csv']` and `mime: 'text/csv'` describe the format.
- `read(file)` splits the text into rows of numbers. The pilot is the file name without its extension, glider and site are `null`, the date comes from the first fix and every row becomes a fix.
- `write(track)` joins the fixes back into the same four columns.

The test `src/lib/plugins/examples.test.ts` checks that it validates and that a written track reads back unchanged.
