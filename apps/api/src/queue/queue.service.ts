import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { JobState } from '@spotiseek/shared';
import { PrismaService } from '../prisma/prisma.service';

export type JobHandler = (data: any, jobId: string) => Promise<void>;

interface QueueConfig {
  concurrency: number;
  maxAttempts: number;
  /** ms entre tentativas (base do backoff exponencial) */
  backoffMs: number;
  /** rate-limit: intervalo mínimo entre inícios de job (ms) */
  minIntervalMs?: number;
}

/**
 * Fila durável embarcada — substitui BullMQ/Redis na stack ultraleve.
 * Persiste jobs no SQLite (tabela Job) → sobrevive a restart. Cada fila tem um
 * loop de polling com limite de concorrência, retry com backoff exponencial e
 * rate-limit opcional (essencial p/ não floodar buscas no Soulseek).
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Queue');
  private handlers = new Map<string, JobHandler>();
  private configs = new Map<string, QueueConfig>();
  private active = new Map<string, number>();
  private lastStart = new Map<string, number>();
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  register(queue: string, handler: JobHandler, config: Partial<QueueConfig> = {}) {
    this.handlers.set(queue, handler);
    this.configs.set(queue, {
      concurrency: config.concurrency ?? 1,
      maxAttempts: config.maxAttempts ?? 3,
      backoffMs: config.backoffMs ?? 5000,
      minIntervalMs: config.minIntervalMs,
    });
    this.active.set(queue, 0);
  }

  async add(queue: string, data: unknown, opts: { maxAttempts?: number; delayMs?: number; priority?: number } = {}) {
    const runAt = new Date(Date.now() + (opts.delayMs ?? 0));
    return this.prisma.job.create({
      data: {
        queue,
        data: PrismaService.json(data),
        maxAttempts: opts.maxAttempts ?? this.configs.get(queue)?.maxAttempts ?? 3,
        priority: opts.priority ?? 0,
        runAt,
      },
    });
  }

  onModuleInit() {
    this.running = true;
    // recuperação: jobs travados em ACTIVE (restart no meio) voltam p/ WAITING
    this.prisma.job
      .updateMany({ where: { state: JobState.ACTIVE }, data: { state: JobState.WAITING } })
      .catch(() => {});
    this.timer = setInterval(() => this.tick().catch((e) => this.log.error(e)), 750);
  }

  onModuleDestroy() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (!this.running) return;
    for (const [queue, cfg] of this.configs) {
      const handler = this.handlers.get(queue);
      if (!handler) continue;
      let inFlight = this.active.get(queue) ?? 0;
      while (inFlight < cfg.concurrency) {
        // rate-limit por fila
        if (cfg.minIntervalMs) {
          const last = this.lastStart.get(queue) ?? 0;
          if (Date.now() - last < cfg.minIntervalMs) break;
        }
        const job = await this.claim(queue);
        if (!job) break;
        this.lastStart.set(queue, Date.now());
        inFlight++;
        this.active.set(queue, inFlight);
        this.run(queue, job, handler, cfg).finally(() => {
          this.active.set(queue, (this.active.get(queue) ?? 1) - 1);
        });
      }
    }
  }

  /** Reivindica um job WAITING pronto (transação atômica via updateMany por id). */
  private async claim(queue: string) {
    const candidate = await this.prisma.job.findFirst({
      where: { queue, state: JobState.WAITING, runAt: { lte: new Date() } },
      orderBy: [{ priority: 'desc' }, { runAt: 'asc' }],
    });
    if (!candidate) return null;
    const res = await this.prisma.job.updateMany({
      where: { id: candidate.id, state: JobState.WAITING },
      data: { state: JobState.ACTIVE },
    });
    if (res.count === 0) return null; // outro worker pegou
    return candidate;
  }

  private async run(queue: string, job: { id: string; data: string; attempts: number; maxAttempts: number }, handler: JobHandler, cfg: QueueConfig) {
    const data = PrismaService.parse<any>(job.data, {});
    try {
      await handler(data, job.id);
      await this.prisma.job.delete({ where: { id: job.id } }).catch(() => {});
    } catch (err: any) {
      const attempts = job.attempts + 1;
      if (attempts >= job.maxAttempts) {
        await this.prisma.job.update({
          where: { id: job.id },
          data: { state: JobState.FAILED, attempts, error: String(err?.message ?? err) },
        });
        this.log.warn(`[${queue}] job ${job.id} falhou definitivamente: ${err?.message ?? err}`);
      } else {
        const delay = cfg.backoffMs * Math.pow(2, attempts - 1);
        await this.prisma.job.update({
          where: { id: job.id },
          data: { state: JobState.WAITING, attempts, runAt: new Date(Date.now() + delay), error: String(err?.message ?? err) },
        });
        this.log.debug(`[${queue}] job ${job.id} retry ${attempts}/${job.maxAttempts} em ${delay}ms`);
      }
    }
  }

  async counts() {
    const rows = await this.prisma.job.groupBy({ by: ['queue', 'state'], _count: true });
    return rows;
  }
}
