import "reflect-metadata";
import {NestFactory} from "@nestjs/core";
import {AppModule} from "./app.module";
import {loadConfig} from "./config";
async function bootstrap(){const config=loadConfig();const app=await NestFactory.create(AppModule,{cors:false,rawBody:true});app.enableShutdownHooks();await app.listen(config.port,"0.0.0.0")}
void bootstrap();