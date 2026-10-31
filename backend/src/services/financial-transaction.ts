import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma.js';
import { AppError } from '../errors/app-error.js';

export async function financialTransaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
      if (!retryable || attempt === 3) {
        if (retryable) throw new AppError('Conflito na operação financeira. Tente novamente.', 409, 'FINANCIAL_CONCURRENCY_CONFLICT');
        throw error;
      }
    }
  }
  throw new AppError('Conflito na operação financeira. Tente novamente.', 409, 'FINANCIAL_CONCURRENCY_CONFLICT');
}

export async function nextBankMovementNumber(transaction: Prisma.TransactionClient): Promise<string> {
  const rows = await transaction.$queryRaw<Array<{ value: bigint }>>`SELECT nextval('bank_movement_number_seq') AS value`;
  const value = rows[0]?.value;
  if (value === undefined) throw new AppError('Não foi possível numerar a movimentação financeira.', 500, 'BANK_MOVEMENT_NUMBER_ERROR');
  return `MOV-${value.toString().padStart(8, '0')}`;
}
