import {Module} from '@nestjs/common';
import {DatabaseModule} from '../database/database.module';
import {SlaPolicyService} from './sla-policy.service';
import {SlaPolicyController} from './sla-policy.controller';
@Module({imports:[DatabaseModule],controllers:[SlaPolicyController],providers:[SlaPolicyService]})
export class SlaPolicyModule{}
