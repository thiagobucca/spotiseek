import { Module } from '@nestjs/common';
import { PlaylistsController } from './playlists.controller';

@Module({
  controllers: [PlaylistsController],
})
export class PlaylistsModule {}
