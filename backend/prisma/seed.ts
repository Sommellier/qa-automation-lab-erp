import { AddressType, OrderStatus, Prisma, PrismaClient, StockMovementType, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { BCRYPT_ROUNDS } from '../src/config/security.js';
import { cleanCategoryName, normalizeCategoryName } from '../src/utils/category-name.js';

const prisma = new PrismaClient();

const users = [
  {
    name: 'Administrador',
    email: 'admin@qamgmt.local',
    password: 'Admin@123',
    role: UserRole.ADMIN,
  },
  {
    name: 'Analista',
    email: 'analista@qamgmt.local',
    password: 'Analista@123',
    role: UserRole.ANALISTA,
  },
  {
    name: 'Visualizador',
    email: 'visualizador@qamgmt.local',
    password: 'Visualizador@123',
    role: UserRole.VISUALIZADOR,
  },
] as const;

const clients = [
  {
    name: 'Carlos Silva',
    document: '12345678900',
    email: 'carlos.silva@empresa.com',
    phone: '47999999999',
    active: true,
  },
  {
    name: 'Maria Souza',
    document: '98765432100',
    email: 'maria.souza@empresa.com',
    phone: '48988888888',
    active: false,
  },
  {
    name: 'João Oliveira',
    document: 'CLIENTE-JOAO-001',
    email: 'joao.oliveira@empresa.com',
    phone: null,
    active: true,
  },
  {
    name: 'Ana Pereira',
    document: 'CLIENTE-ANA-002',
    email: 'ana.pereira@empresa.com',
    phone: '11977777777',
    active: false,
  },
] as const;

const suppliers = [
  { name: 'Tech Distribuidora', document: 'FORN-TECH-001', email: 'compras@techdistribuidora.local', phone: '1133334444', contactName: 'Marina Costa', active: true },
  { name: 'Office Supply', document: 'FORN-OFFICE-002', email: 'vendas@officesupply.local', phone: '1144445555', contactName: 'Paulo Mendes', active: true },
] as const;

const products = [
  {
    name: 'Notebook Pro',
    sku: 'NOTE001',
    description: 'Notebook profissional de alto desempenho',
    price: '5999.90',
    stock: 10,
    category: 'Informática',
    active: true,
  },
  {
    name: 'Mouse Gamer',
    sku: 'MOUSE001',
    description: 'Mouse de alta precisão',
    price: '299.90',
    stock: 0,
    category: 'Periféricos',
    active: true,
  },
  {
    name: 'Monitor 27',
    sku: 'MON001',
    description: 'Monitor de 27 polegadas',
    price: '1499.90',
    stock: 5,
    category: 'Informática',
    active: false,
  },
  {
    name: 'Cadeira Office',
    sku: 'CHAIR001',
    description: 'Cadeira ergonômica para escritório',
    price: '899.90',
    stock: 15,
    category: 'Escritório',
    active: true,
  },
  {
    name: 'Suporte para Notebook',
    sku: 'SUPNOTE001',
    description: null,
    price: '129.90',
    stock: 7,
    category: 'Acessórios',
    active: true,
  },
] as const;

const clientAddresses = [
  { id: '10000000-0000-4000-8000-000000000001', clientDocument: '12345678900', type: AddressType.RESIDENTIAL,
    zipCode: '89200-000', street: 'Rua das Flores', number: '123', complement: 'Apto 402', district: 'Centro',
    city: 'Joinville', state: 'SC', country: 'Brasil', isPrimary: true, active: true },
  { id: '10000000-0000-4000-8000-000000000002', clientDocument: '12345678900', type: AddressType.COMMERCIAL,
    zipCode: '89201-100', street: 'Avenida Central', number: '500', complement: null, district: 'América',
    city: 'Joinville', state: 'SC', country: 'Brasil', isPrimary: false, active: true },
  { id: '10000000-0000-4000-8000-000000000003', clientDocument: '12345678900', type: AddressType.OTHER,
    zipCode: '89202-200', street: 'Rua Antiga', number: 'S/N', complement: null, district: 'Bucarein',
    city: 'Joinville', state: 'SC', country: 'Brasil', isPrimary: false, active: false },
  { id: '10000000-0000-4000-8000-000000000004', clientDocument: '98765432100', type: AddressType.RESIDENTIAL,
    zipCode: '88000-000', street: 'Rua das Palmeiras', number: '221B', complement: null, district: 'Centro',
    city: 'Florianópolis', state: 'SC', country: 'Brasil', isPrimary: true, active: true },
] as const;

const categoryNames = [...new Set(products.map((product) => cleanCategoryName(product.category)))];

const sampleOrders = [
  { number: 'PED-000001', clientDocument: '12345678900', status: OrderStatus.PENDING,
    items: [{ sku: 'NOTE001', quantity: 1 }] },
  { number: 'PED-000002', clientDocument: 'CLIENTE-JOAO-001', status: OrderStatus.CONFIRMED,
    items: [{ sku: 'CHAIR001', quantity: 2 }] },
  { number: 'PED-000003', clientDocument: '12345678900', status: OrderStatus.PROCESSING,
    items: [{ sku: 'SUPNOTE001', quantity: 3 }] },
  { number: 'PED-000004', clientDocument: 'CLIENTE-JOAO-001', status: OrderStatus.COMPLETED,
    items: [{ sku: 'NOTE001', quantity: 1 }, { sku: 'SUPNOTE001', quantity: 1 }] },
  { number: 'PED-000005', clientDocument: '12345678900', status: OrderStatus.CANCELLED,
    items: [{ sku: 'MOUSE001', quantity: 2 }] },
] as const;

async function main(): Promise<void> {
  for (const user of users) {
    const passwordHash = await bcrypt.hash(user.password, BCRYPT_ROUNDS);

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
        active: true,
      },
      create: {
        name: user.name,
        email: user.email,
        passwordHash,
        role: user.role,
      },
    });
  }

  await prisma.purchaseApprovalRule.upsert({
    where: { role: UserRole.ANALISTA },
    update: { maxAmount: new Prisma.Decimal('10000.00'), active: true },
    create: { role: UserRole.ANALISTA, maxAmount: new Prisma.Decimal('10000.00'), active: true },
  });
  await prisma.purchaseApprovalRule.upsert({
    where: { role: UserRole.ADMIN },
    update: { maxAmount: null, active: true },
    create: { role: UserRole.ADMIN, maxAmount: null, active: true },
  });

  for (const client of clients) {
    await prisma.client.upsert({
      where: { document: client.document },
      update: client,
      create: client,
    });
  }

  for (const supplier of suppliers) {
    await prisma.supplier.upsert({ where: { document: supplier.document }, update: supplier, create: supplier });
  }

  for (const clientDocument of [...new Set(clientAddresses.map((address) => address.clientDocument))]) {
    const client = await prisma.client.findUniqueOrThrow({ where: { document: clientDocument }, select: { id: true } });
    await prisma.$transaction(async (transaction) => {
      await transaction.clientAddress.updateMany({ where: { clientId: client.id }, data: { isPrimary: false } });
      for (const address of clientAddresses.filter((item) => item.clientDocument === clientDocument)) {
        const { clientDocument: _document, ...data } = address;
        await transaction.clientAddress.upsert({
          where: { id: data.id },
          update: { ...data, clientId: client.id },
          create: { ...data, clientId: client.id },
        });
      }
    });
  }

  const categories = new Map<string, string>();
  for (const name of categoryNames) {
    const normalizedName = normalizeCategoryName(name);
    const category = await prisma.category.upsert({
      where: { normalizedName },
      update: { name, active: true },
      create: { name, normalizedName, active: true },
      select: { id: true },
    });
    categories.set(normalizedName, category.id);
  }

  for (const product of products) {
    const categoryId = categories.get(normalizeCategoryName(product.category));
    if (!categoryId) throw new Error(`Categoria do seed não encontrada: ${product.category}`);
    const stored = await prisma.product.upsert({
      where: { sku: product.sku },
      update: {
        name: product.name, description: product.description, price: product.price,
        categoryId, active: product.active,
      },
      create: {
        name: product.name, sku: product.sku, description: product.description, price: product.price,
        stock: product.stock, categoryId, active: product.active,
      },
    });
    if (stored.stock > 0 && !await prisma.stockMovement.findFirst({ where: { productId: stored.id }, select: { id: true } })) {
      const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@qamgmt.local' }, select: { id: true } });
      await prisma.stockMovement.create({ data: {
        productId: stored.id, type: StockMovementType.INITIAL_BALANCE, quantity: stored.stock,
        previousStock: 0, newStock: stored.stock, reason: 'Saldo inicial do produto', createdById: admin.id,
      } });
    }
  }

  for (const sample of sampleOrders) {
    const client = await prisma.client.findUniqueOrThrow({ where: { document: sample.clientDocument } });
    const storedProducts = await prisma.product.findMany({ where: { sku: { in: sample.items.map((item) => item.sku) } } });
    const orderItems = sample.items.map((item) => {
      const product = storedProducts.find((candidate) => candidate.sku === item.sku);
      if (!product) throw new Error(`Produto do seed não encontrado: ${item.sku}`);
      const subtotal = product.price.mul(item.quantity);
      return { productId: product.id, productName: product.name, productSku: product.sku,
        quantity: item.quantity, unitPrice: product.price, subtotal };
    });
    const total = orderItems.reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0));
    const order = await prisma.order.upsert({
      where: { number: sample.number },
      update: { clientId: client.id, status: sample.status, total },
      create: { number: sample.number, clientId: client.id, status: sample.status, total },
    });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.orderItem.createMany({ data: orderItems.map((item) => ({ ...item, orderId: order.id })) });
  }

  await prisma.$executeRawUnsafe(`
    SELECT setval(
      'order_number_seq',
      GREATEST(
        5,
        COALESCE((SELECT MAX(SUBSTRING("number" FROM 5)::bigint) FROM "orders" WHERE "number" ~ '^PED-[0-9]+$'), 0)
      ),
      true
    )
  `);

  await prisma.$executeRawUnsafe(`
    SELECT setval(
      'purchase_order_number_seq',
      GREATEST(1, COALESCE((SELECT MAX(SUBSTRING("number" FROM 4)::bigint) FROM "purchase_orders" WHERE "number" ~ '^PC-[0-9]+$'), 0)),
      COALESCE((SELECT COUNT(*) > 0 FROM "purchase_orders"), false)
    )
  `);

  await prisma.$executeRawUnsafe(`
    SELECT setval(
      'purchase_receipt_number_seq',
      GREATEST(1, COALESCE((SELECT MAX(SUBSTRING("number" FROM 5)::bigint) FROM "purchase_receipts" WHERE "number" ~ '^REC-[0-9]+$'), 0)),
      COALESCE((SELECT COUNT(*) > 0 FROM "purchase_receipts"), false)
    )
  `);

  await prisma.$executeRawUnsafe(`
    SELECT setval(
      'payable_number_seq',
      GREATEST(1, COALESCE((SELECT MAX(SUBSTRING("number" FROM 4)::bigint) FROM "payables" WHERE "number" ~ '^CP-[0-9]+$'), 0)),
      COALESCE((SELECT COUNT(*) > 0 FROM "payables"), false)
    )
  `);

  await prisma.$executeRawUnsafe(`
    SELECT setval(
      'payable_payment_number_seq',
      GREATEST(1, COALESCE((SELECT MAX(SUBSTRING("number" FROM 5)::bigint) FROM "payable_payments" WHERE "number" ~ '^PAG-[0-9]+$'), 0)),
      COALESCE((SELECT COUNT(*) > 0 FROM "payable_payments"), false)
    )
  `);

  await prisma.$executeRawUnsafe(`
    SELECT setval(
      'receivable_number_seq',
      GREATEST(1, COALESCE((SELECT MAX(SUBSTRING("number" FROM 4)::bigint) FROM "receivables" WHERE "number" ~ '^CR-[0-9]+$'), 0)),
      COALESCE((SELECT COUNT(*) > 0 FROM "receivables"), false)
    )
  `);

  await prisma.$executeRawUnsafe(`
    SELECT setval(
      'receivable_collection_number_seq',
      GREATEST(1, COALESCE((SELECT MAX(SUBSTRING("number" FROM 5)::bigint) FROM "receivable_collections" WHERE "number" ~ '^RCB-[0-9]+$'), 0)),
      COALESCE((SELECT COUNT(*) > 0 FROM "receivable_collections"), false)
    )
  `);

  console.info('Usuários, alçadas, clientes, fornecedores, endereços, categorias, produtos e pedidos de desenvolvimento criados com sucesso.');
}

main()
  .catch((error: unknown) => {
    console.error('Falha ao executar o seed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
