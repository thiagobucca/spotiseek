import { Controller, Get, Param, Query, Req, Res, UseGuards, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { extname } from 'path';
import { JwtService } from '@nestjs/jwt';
import { JwtGuard } from '../auth/jwt.guard';
import { LibraryService } from './library.service';
import { PrismaService } from '../prisma/prisma.service';

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.wav': 'audio/wav',
};

@Controller('library')
export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  @UseGuards(JwtGuard)
  @Get('artists')
  artists() {
    return this.library.artists();
  }

  @UseGuards(JwtGuard)
  @Get('albums')
  albums() {
    return this.library.albums();
  }

  @UseGuards(JwtGuard)
  @Get('tracks')
  tracks(@Query('q') q = '') {
    return this.library.searchTracks(q);
  }

  /**
   * Stream de áudio com suporte a Range (seek). O <audio> do browser não envia header
   * Authorization, então o token vai por query (?token=). Single-user, rede local.
   */
  @Get('tracks/:id/stream')
  async stream(@Param('id') id: string, @Query('token') token: string, @Req() req: Request, @Res() res: Response) {
    try {
      this.jwt.verify(token, { secret: process.env.JWT_SECRET || 'dev-jwt-secret' });
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
    const lf = await this.prisma.libraryFile.findUnique({ where: { trackId: id } });
    if (!lf) throw new NotFoundException('Arquivo não está na biblioteca');

    const stats = await stat(lf.path).catch(() => null);
    if (!stats) throw new NotFoundException('Arquivo ausente no disco');

    const mime = AUDIO_MIME[extname(lf.path).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : stats.size - 1;
      res.status(206);
      res.set({
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(end - start + 1),
        'Content-Type': mime,
      });
      createReadStream(lf.path, { start, end }).pipe(res);
    } else {
      res.set({ 'Content-Length': String(stats.size), 'Content-Type': mime, 'Accept-Ranges': 'bytes' });
      createReadStream(lf.path).pipe(res);
    }
  }
}
