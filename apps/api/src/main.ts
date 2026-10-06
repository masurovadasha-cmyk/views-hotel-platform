import "reflect-metadata";
import {NestFactory} from "@nestjs/core";
import type {NestExpressApplication} from "@nestjs/platform-express";
import {AppModule} from "./app.module";
import {loadConfig} from "./config";
import {RedactingLogger} from "./security/redacting-logger";

async function bootstrap(){
  const config=loadConfig();
  const app=await NestFactory.create<NestExpressApplication>(AppModule,{
    cors:false,
    rawBody:true,
    logger:new RedactingLogger()
  });
  // Payme Merchant API officially sends Content-Type: text/json.
  // Keep that route raw so JSON-RPC parse errors can still return HTTP 200
  // with the protocol-specific -32700 response instead of an Express 400.
  app.useBodyParser("raw",{type:"text/json",limit:"64kb"});
  app.enableShutdownHooks();
  await app.listen(config.port,"0.0.0.0");
}
void bootstrap();
