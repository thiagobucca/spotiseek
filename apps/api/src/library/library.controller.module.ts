import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';

// LibraryService é fornecido globalmente pelo JobsModule; aqui só o controller.
@Module({
  controllers: [LibraryController],
})
export class LibraryControllerModule {}
