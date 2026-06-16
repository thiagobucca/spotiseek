import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { QueueModule } from './queue/queue.module';
import { ProvidersModule } from './providers/providers.module';
import { SpotifyModule } from './spotify/spotify.module';
import { MatchingModule } from './matching/matching.module';
import { CatalogModule } from './catalog/catalog.module';
import { JobsModule } from './jobs/jobs.module';
import { PlaylistsModule } from './playlists/playlists.module';
import { TracksModule } from './tracks/tracks.module';
import { WishlistModule } from './wishlist/wishlist.module';
import { DownloadsModule } from './downloads/downloads.module';
import { LibraryControllerModule } from './library/library.controller.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { SchedulerModule } from './scheduler/scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // UI estática (SvelteKit build copiado p/ ./public). SPA fallback p/ rotas client-side.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api*'],
    }),
    // infra global
    PrismaModule,
    SettingsModule,
    EventsModule,
    AuthModule,
    QueueModule,
    MatchingModule,
    CatalogModule,
    ProvidersModule,
    SpotifyModule,
    JobsModule,
    // feature controllers
    PlaylistsModule,
    TracksModule,
    WishlistModule,
    DownloadsModule,
    LibraryControllerModule,
    DashboardModule,
    HealthModule,
    SchedulerModule,
  ],
})
export class AppModule {}
