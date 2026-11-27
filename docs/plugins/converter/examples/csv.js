// A converter for a plain CSV track file with the columns t (Unix ms), lat, lon and alt, no header.
export default {
  id: 'acme/csv',
  name: 'CSV tracks',
  kind: 'converter',
  apiVersion: 1,
  label: 'CSV',
  extensions: ['csv'],
  mime: 'text/csv',
  async read(file) {
    // Throw an Error with a message for the user when the file is not valid. The app validates the result as well.
    const rows = (await file.text())
      .trim()
      .split('\n')
      .map((line) => line.split(',').map(Number));
    return {
      pilot: file.name.replace(/\.[^.]*$/, ''),
      glider: null,
      site: null,
      date: new Date(rows[0][0]).toISOString().slice(0, 10),
      fixes: rows.map(([t, lat, lon, alt]) => ({ t, lat, lon, alt }))
    };
  },
  write: (track) => track.fixes.map((f) => [f.t, f.lat, f.lon, f.alt].join(',')).join('\n')
};
