import "reflect-metadata";
import {NestFactory} from "@nestjs/core";
import {AppModule} from "./app.module";
import {loadConfig} from "./config";
import {RedactingLogger} from "./security/redacting-logger";

async function bootstrap(){
  const config=loadConfig();
  const app=await NestFactory.create(AppModule,{
    cors:false,
    rawBody:true,
    logger:new RedactingLogger()
  });
  app.enableShutdownHooks();
  await app.listen(config.port,"0.0.0.0");
}
void bootstrap();
