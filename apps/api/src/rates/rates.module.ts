import {Module} from "@nestjs/common";
import {CancellationPreviewController} from "./cancellation-preview.controller";
import {CancellationPreviewService} from "./cancellation-preview.service";
import {QuoteController} from "./quote.controller";
import {QuoteService} from "./quote.service";

@Module({
  controllers:[QuoteController,CancellationPreviewController],
  providers:[QuoteService,CancellationPreviewService],
  exports:[QuoteService,CancellationPreviewService]
})
export class RatesModule{}
