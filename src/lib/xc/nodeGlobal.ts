// The solver's `collections` dependency reads Node's `global`, which workers do not have.
// Imported before the solver so it runs first.
(globalThis as { global?: unknown }).global ??= globalThis;
