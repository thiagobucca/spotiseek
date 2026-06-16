import { Global, Module, OnModuleInit } from '@nestjs/common';
import { SlskdProvider } from './soulseek/slskd.provider';
import { ProviderRegistry } from './provider.registry';
import { ProvidersController } from './providers.controller';
import { PrismaService } from '../prisma/prisma.service';

@Global()
@Module({
  providers: [SlskdProvider, ProviderRegistry],
  controllers: [ProvidersController],
  exports: [ProviderRegistry],
})
export class ProvidersModule implements OnModuleInit {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly slskd: SlskdProvider,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.registry.register(this.slskd);
    // garante linha do provider no DB (p/ prioridade/saúde persistidas)
    await this.prisma.provider.upsert({
      where: { key: this.slskd.key },
      create: { key: this.slskd.key, name: this.slskd.name, priority: this.slskd.priority },
      update: { name: this.slskd.name },
    });
  }
}
