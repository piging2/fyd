export function readFileSync() {
  process.send?.({ kind: 'credential-read-blocked' });
  const error = new Error('P0 fixture blocks credential-file reads without accessing the filesystem');
  error.code = 'EACCES';
  throw error;
}
