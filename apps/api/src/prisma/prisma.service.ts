import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Prisma');

  async onModuleInit() {
    await this.$connect();
    this.log.log('SQLite conectado');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Helpers JSON (SQLite guarda como String). */
  static json<T>(value: T): string {
    return JSON.stringify(value ?? null);
  }
  static parse<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
}
