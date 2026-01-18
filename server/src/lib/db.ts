import { PrismaClient } from "@prisma/client";

interface GlobalWithPrisma {
  prisma?: PrismaClient;
}

const globalForPrisma = global as GlobalWithPrisma;

// Optimized Prisma client configuration
const prisma = globalForPrisma.prisma || new PrismaClient({
  // Disable query logging in production for performance
  log: process.env.NODE_ENV === "production"
    ? []
    : ["warn", "error"],
});

// Pre-connect to database (reduces cold start latency)
prisma.$connect().catch((err: Error) => {
  console.error("Failed to connect to database:", err);
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
