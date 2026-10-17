import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['--env-file-if-exists=.env', '--v8-pool-size=1', '--test', '--test-concurrency=1', 'tests/*.test.js'], {
  env: { ...process.env, HRMS_TEST_POSTGRES: '1' }, stdio: 'inherit', windowsHide: true,
});
child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
child.on('close', (code) => { process.exitCode = code || 0; });
