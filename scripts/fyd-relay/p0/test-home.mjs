export function homedir() {
  if (!process.env.FYD_P0_DIR) throw new Error('P0 test directory required');
  return process.env.FYD_P0_DIR;
}
