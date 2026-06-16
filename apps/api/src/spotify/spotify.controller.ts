import { Controller, Delete, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { SpotifyService } from './spotify.service';
import { JwtGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';

@Controller('spotify')
export class SpotifyController {
  constructor(private readonly spotify: SpotifyService, private readonly prisma: PrismaService) {}

  /**
   * Retorna a URL de consent do Spotify (JSON). O frontend chama isto com o
   * Bearer token e então redireciona o browser — assim a autorização carrega a
   * identidade do usuário sem precisar passar o JWT num link.
   */
  @UseGuards(JwtGuard)
  @Get('authorize-url')
  authorizeUrl(@Req() req: any) {
    return { url: this.spotify.authorizeUrl(req.user.sub) };
  }

  /** Callback público (Spotify redireciona o browser para cá). */
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      await this.spotify.handleCallback(code, state);
      res.redirect('/settings?spotify=connected');
    } catch {
      res.redirect('/settings?spotify=error');
    }
  }

  @UseGuards(JwtGuard)
  @Get('status')
  status(@Req() req: any) {
    return this.spotify.status(req.user.sub);
  }

  @UseGuards(JwtGuard)
  @Delete('connection')
  disconnect(@Req() req: any) {
    return this.spotify.disconnect(req.user.sub);
  }
}
