import { hash } from "@node-rs/argon2";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Fixed judge demo credentials — documented in root README. */
export const DEMO_EMAIL = "demo@flow.rpay.space";
export const DEMO_PASSWORD = "FlowDemo2026!";
const DEMO_BUSINESS_NAME = "Flow Demo Shop";
const DEMO_COUNTRY = "NG";
const DEMO_LINK_SLUG = "flow-demo";

const DEMO_PRODUCTS = [
  {
    name: "Starter Pack",
    description: "Sample digital product for judge demos.",
    priceSats: 2_100n,
  },
  {
    name: "Workshop Seat",
    description: "One seat at a Flow Lightning workshop.",
    priceSats: 10_000n,
  },
  {
    name: "Merch Drop",
    description: "Limited demo merch — pay in sats.",
    priceSats: 5_000n,
  },
] as const;

async function upsertDemoProduct(
  businessId: string,
  product: (typeof DEMO_PRODUCTS)[number],
) {
  const existing = await prisma.product.findFirst({
    where: { businessId, name: product.name },
  });
  if (existing) {
    return prisma.product.update({
      where: { id: existing.id },
      data: {
        description: product.description,
        priceSats: product.priceSats,
        active: true,
      },
    });
  }
  return prisma.product.create({
    data: {
      businessId,
      name: product.name,
      description: product.description,
      priceSats: product.priceSats,
      active: true,
    },
  });
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required to seed");
  }

  const passwordHash = await hash(DEMO_PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { passwordHash },
    create: {
      email: DEMO_EMAIL,
      passwordHash,
    },
  });

  let business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
  });

  if (business) {
    business = await prisma.business.update({
      where: { id: business.id },
      data: {
        name: DEMO_BUSINESS_NAME,
        country: DEMO_COUNTRY,
      },
    });
  } else {
    business = await prisma.business.create({
      data: {
        ownerId: user.id,
        name: DEMO_BUSINESS_NAME,
        country: DEMO_COUNTRY,
        balanceSats: 25_000n,
      },
    });
  }

  const products = [];
  for (const spec of DEMO_PRODUCTS) {
    products.push(await upsertDemoProduct(business.id, spec));
  }

  const starter = products[0]!;
  const existingLink = await prisma.paymentLink.findUnique({
    where: { slug: DEMO_LINK_SLUG },
  });

  if (existingLink) {
    await prisma.paymentLink.update({
      where: { id: existingLink.id },
      data: {
        businessId: business.id,
        productId: starter.id,
        status: "active",
      },
    });
  } else {
    await prisma.paymentLink.create({
      data: {
        businessId: business.id,
        productId: starter.id,
        slug: DEMO_LINK_SLUG,
        status: "active",
      },
    });
  }

  console.log("Demo merchant ready");
  console.log(`  email:    ${DEMO_EMAIL}`);
  console.log(`  password: ${DEMO_PASSWORD}`);
  console.log(`  shop:     ${DEMO_BUSINESS_NAME}`);
  console.log(`  products: ${products.map((p) => p.name).join(", ")}`);
  console.log(`  pay link: /pay/link/${DEMO_LINK_SLUG}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
