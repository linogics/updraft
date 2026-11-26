import {
  type CameraProp,
  copyKeys,
  type Interp,
  keyAt,
  type KeyClip,
  type KeyRef,
  mapTracks,
  moveKeys,
  pasteKeys,
  removeKeys,
  setKeysInterp,
  shiftValues,
  timeSets
} from '#lib/domain/cameraPath';

import type { StudioState } from './studio.svelte';

/** Timeline camera editing: selection, clipboard and edits. Every edit goes through StudioState.editCamera. */
export class CameraEditor {
  expanded = $state(false);
  /** Status line of the camera row, e.g. after Auto. */
  message = $state('');
  /** Selected keys as the user left them. Keys that no longer exist drop out of live. */
  picked = $state.raw<KeyRef[]>([]);
  live = $derived(this.picked.filter((r) => !!keyAt(this.studio.cameraTracks[r.prop], r.t)));
  private studio: StudioState;
  private clip: KeyClip | null = null;

  constructor(studio: StudioState) {
    this.studio = studio;
  }

  isOn(ref: KeyRef): boolean {
    return this.live.some((s) => s.prop === ref.prop && s.t === ref.t);
  }

  select(refs: KeyRef[]) {
    this.picked = refs;
  }

  /** Adds the refs, or removes them when all are already selected. */
  toggle(refs: KeyRef[]) {
    const all = refs.every((r) => this.isOn(r));
    const rest = this.live.filter((s) => !refs.some((r) => r.prop === s.prop && r.t === s.t));
    this.picked = all ? rest : [...rest, ...refs];
  }

  clear() {
    this.picked = [];
  }

  remove() {
    if (!this.live.length) return;
    const sets = timeSets(this.live);
    this.studio.editCamera(mapTracks(this.studio.cameraTracks, (tr, p) => removeKeys(tr, sets[p])));
    this.clear();
  }

  setInterp(interp: Interp) {
    if (!this.live.length) return;
    const sets = timeSets(this.live);
    this.studio.editCamera(mapTracks(this.studio.cameraTracks, (tr, p) => setKeysInterp(tr, sets[p], interp)));
  }

  /** Moves the selected keys by dt ms and keeps them selected. */
  move(dt: number) {
    if (!dt || !this.live.length) return;
    const sets = timeSets(this.live);
    this.studio.editCamera(mapTracks(this.studio.cameraTracks, (tr, p) => moveKeys(tr, sets[p], dt)));
    this.picked = this.live.map((r) => ({ prop: r.prop, t: r.t + dt }));
  }

  /** Changes the value of the selected keys of one prop by dv, in lane space. */
  shiftValues(prop: CameraProp, dv: number) {
    if (!dv) return;
    const sets = timeSets(this.live.filter((r) => r.prop === prop));
    this.studio.editCamera(
      mapTracks(this.studio.cameraTracks, (tr, p) => (p === prop ? shiftValues(tr, p, sets[p], dv) : tr))
    );
  }

  /** Copies the selected keys. False when none is selected. */
  copy(): boolean {
    const clip = copyKeys(this.studio.cameraTracks, timeSets(this.live));
    if (clip) this.clip = clip;
    return !!clip;
  }

  /** Pastes the copied keys at the playhead. */
  paste() {
    if (!this.clip) return;
    this.studio.editCamera(pasteKeys(this.studio.cameraTracks, this.clip, this.studio.time));
  }
}
