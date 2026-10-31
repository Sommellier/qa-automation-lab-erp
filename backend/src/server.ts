import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './config/prisma.js';

let server: ReturnType<typeof app.listen> | undefined;

async function shutdown(signal: string): Promise<void> {
  console.info(`${signal} recebido. Encerrando servidor...`);
  if (!server) {
    await prisma.$disconnect();
    process.exit(0);
  }

  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

async function start(): Promise<void> {
  try {
    await prisma.$connect();
    console.info('Conexão com PostgreSQL estabelecida.');
    server = app.listen(env.PORT, (error?: Error) => {
      if (error) {
        console.error(`Não foi possível iniciar o backend na porta ${env.PORT}.`, error);
        void prisma.$disconnect().finally(() => process.exit(1));
        return;
      }
      console.info(`Backend disponível em http://localhost:${env.PORT}`);
    });
  } catch (error: unknown) {
    console.error('Falha ao conectar ao PostgreSQL. Verifique DATABASE_URL e a disponibilidade do banco.', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

void start();
