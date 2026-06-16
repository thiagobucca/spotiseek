import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { SseEvent, ActivityItem } from '@spotiseek/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventsService {
  private readonly stream = new Subject<SseEvent>();

  constructor(private readonly prisma: PrismaService) {}

  /** Observable consumido pelo controller SSE. */
  asObservable(): Observable<SseEvent> {
    return this.stream.asObservable();
  }

  emit(event: SseEvent) {
    this.stream.next(event);
  }

  /** Registra atividade no AuditLog e propaga como evento `log`. */
  async log(level: ActivityItem['level'], scope: string, message: string, meta?: unknown) {
    const row = await this.prisma.auditLog.create({
      data: { level, scope, message, meta: meta ? PrismaService.json(meta) : null },
    });
    this.emit({
      type: 'log',
      data: { id: row.id, level, message, at: row.createdAt.toISOString() },
    });
  }
}
