const TABLE = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1; // fixed 2020-01-01

/** Store-only zip (no compression). Names are written as UTF-8. */
export function zipStore(files: { name: string; data: Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const header = (size: number, sig: number, fn: (v: DataView) => void) => {
    const buf = new Uint8Array(size);
    const v = new DataView(buf.buffer);
    v.setUint32(0, sig, true);
    fn(v);
    return buf;
  };

  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const common = (v: DataView, o: number) => {
      v.setUint16(o, 20, true); // version needed
      v.setUint16(o + 2, 0x0800, true); // UTF-8 names
      v.setUint16(o + 4, 0, true); // stored
      v.setUint16(o + 6, 0, true); // time
      v.setUint16(o + 8, DOS_DATE, true);
      v.setUint32(o + 10, crc, true);
      v.setUint32(o + 14, f.data.length, true);
      v.setUint32(o + 18, f.data.length, true);
      v.setUint16(o + 22, name.length, true);
    };

    const local = header(30 + name.length, 0x04034b50, (v) => common(v, 4));
    local.set(name, 30);
    const cen = header(46 + name.length, 0x02014b50, (v) => {
      v.setUint16(4, 20, true); // version made by
      common(v, 6);
      v.setUint32(42, offset, true);
    });
    cen.set(name, 46);
    parts.push(local, f.data);
    central.push(cen);
    offset += local.length + f.data.length;
  }

  const size = central.reduce((n, c) => n + c.length, 0);
  const end = header(22, 0x06054b50, (v) => {
    v.setUint16(8, files.length, true);
    v.setUint16(10, files.length, true);
    v.setUint32(12, size, true);
    v.setUint32(16, offset, true);
  });
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }

  return out;
}
