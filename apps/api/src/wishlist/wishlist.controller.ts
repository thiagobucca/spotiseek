import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { WishlistItemDTO, WishlistType } from '@spotiseek/shared';
import { JwtGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from '../jobs/jobs.service';

@UseGuards(JwtGuard)
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly prisma: PrismaService, private readonly jobs: JobsService) {}

  @Get()
  async list(): Promise<WishlistItemDTO[]> {
    const rows = await this.prisma.wishlist.findMany({ orderBy: { createdAt: 'desc' } });
    const out: WishlistItemDTO[] = [];
    for (const w of rows) {
      const resolved = PrismaService.parse<{ trackIds?: string[] }>(w.resolved, {});
      const trackIds = resolved.trackIds ?? [];
      let status = w.status; // fallback: estados pré-resolução (na fila…/resolvendo…/erros)
      if (trackIds.length) {
        const tracks = await this.prisma.track.findMany({
          where: { id: { in: trackIds } },
          select: { status: true },
        });
        status = this.liveStatus(w.type as WishlistType, w.status, tracks);
      }
      out.push({ id: w.id, type: w.type as WishlistType, query: w.query, coverSeed: w.query, status });
    }
    return out;
  }

  /** Calcula o status real a partir do estado das faixas resolvidas. */
  private liveStatus(type: WishlistType, label: string, tracks: { status: string }[]): string {
    const n = tracks.length;
    const imported = tracks.filter((t) => t.status === 'IMPORTED').length;
    const failed = tracks.filter((t) => t.status === 'FAILED').length;
    const active = n - imported - failed;

    if (n === 1) {
      const s = tracks[0].status;
      if (s === 'IMPORTED') return 'na biblioteca';
      if (s === 'FAILED') return 'não encontrada';
      if (s === 'WANTED') return 'na fila';
      return 'baixando';
    }
    if (imported === n) return `completo · ${n} faixas`;
    const parts: string[] = [];
    if (imported) parts.push(`${imported}/${n} na biblioteca`);
    if (active) parts.push(`${active} baixando`);
    if (failed) parts.push(`${failed} não encontradas`);
    return parts.join(' · ') || `${n} faixas`;
  }

  @Post()
  async add(@Body() body: { type: WishlistType; query: string }) {
    const item = await this.prisma.wishlist.create({
      data: { type: body.type, query: body.query, status: 'na fila…' },
    });
    // Resolve em background: Spotify search → cria faixas → busca/baixa no Soulseek.
    await this.jobs.enqueueWishlistResolve(item.id);
    return item;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.prisma.wishlist.delete({ where: { id } });
    return { ok: true };
  }
}
