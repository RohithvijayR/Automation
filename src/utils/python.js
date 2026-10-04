/**
 * cross-platform python command finder helper.
 * On macOS and Linux, the command to invoke Python 3 is 'python3'.
 * On Windows, it is typically 'python'.
 */
export const PYTHON_CMD = process.platform === 'win32' ? 'python' : 'python3';
