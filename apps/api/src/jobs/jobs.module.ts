import { Global, Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { LibraryService } from '../library/library.service';

@Global()
@Module({
  providers: [JobsService, LibraryService],
  exports: [JobsService, LibraryService],
})
export class JobsModule {}
