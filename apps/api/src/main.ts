import "reflect-metadata";
import {NestFactory} from "@nestjs/core";
import type {NestExpressApplication} from "@nestjs/platform-express";
import {raw,type Request,type Response,type NextFunction} from "express";
import {AppModule} from "./app.module";
import {loadConfig} from "./config";
import {resolveListenHost} from "./local-rehearsal-boundary";
import {RedactingLogger} from "./security/redacting-logger";
import {paymeError} from "./payments/payme-merchant-api.service";

async function bootstrap(){
  const config=loadConfig();
  const listenHost=resolveListenHost();
  const app=await NestFactory.create<NestExpressApplication>(AppModule,{
    cors:false,rawBody:true,logger:new RedactingLogger()
  });
  // Route-scoped raw parsing runs before Nest's default JSON parser. It keeps
  // malformed JSON in either supported content type inside the JSON-RPC contract.
  const parser=raw({type:["text/json","application/json"],limit:"64kb",inflate:false});
  app.use("/v1/payments/payme/merchant",(req:Request,res:Response,next:NextFunction)=>{
    if(req.method!=="POST")return next();
    parser(req,res,error=>{
      if(error){res.status(200).json(paymeError(null,-32600));return;}
      if(Buffer.isBuffer(req.body))Object.assign(req,{rawBody:req.body});
      next();
    });
  });
  app.enableShutdownHooks();
  await app.listen(config.port,listenHost);
}
void bootstrap();
