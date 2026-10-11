import {Module} from '@nestjs/common';
import {FolioService} from './folio.service';
import {NightAuditService} from './night-audit.service';
import {FolioController,NightAuditController} from './folio.controller';
@Module({controllers:[FolioController,NightAuditController],providers:[FolioService,NightAuditService]})
export class FolioModule{}
