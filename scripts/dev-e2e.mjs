import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const npmCli = process.env.npm_execpath;

if (!npmCli) {
  console.error('Execute este ambiente pelo comando "npm run dev:e2e".');
  process.exit(1);
}

const application = spawn(process.execPath, [npmCli, 'run', 'dev'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DISABLE_LOGIN_RATE_LIMIT: 'true',
  },
  stdio: 'inherit',
});

application.on('error', (error) => {
  console.error('Não foi possível iniciar o ambiente E2E.', error);
  process.exitCode = 1;
});

application.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
