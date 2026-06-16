import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { TrackStatus } from '@spotiseek/shared';
import { JwtGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';

@UseGuards(JwtGuard)
@Controller('tracks')
export class TracksController {
  constructor(private readonly prisma: PrismaService, private readonly jobs: JobsService) {}

  /** Baixa uma faixa sob demanda: dispara busca → match → download para ela. */
  @Post(':id/download')
  async download(@Param('id') id: string) {
    await this.prisma.track.update({ where: { id }, data: { status: TrackStatus.WANTED } });
    const job = await this.jobs.enqueueTrackSearch(id);
    return { jobId: job.id };
  }
}
