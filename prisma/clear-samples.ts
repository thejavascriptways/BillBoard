import { pathToFileURL } from "node:url";

import { prisma } from "../src/server/db";

async function main() {
  const result = await prisma.expense.deleteMany({ where: { isSample: true } });
  console.log(`Cleared ${result.count} sample expense${result.count === 1 ? "" : "s"}.`);
}

const invokedDirectly =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (invokedDirectly) {
  main()
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
