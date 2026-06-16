import { Controller, Sse, MessageEvent } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  /** GET /api/events — stream SSE multiplexado por tipo. Público (somente leitura). */
  @Sse()
  stream(): Observable<MessageEvent> {
    return this.events.asObservable().pipe(
      map((e) => ({ type: e.type, data: e.data } as MessageEvent)),
    );
  }
}
