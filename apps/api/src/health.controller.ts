import {Controller,Get,ServiceUnavailableException} from "@nestjs/common";
import {DatabaseService} from "./database/database.service";
@Controller()
export class HealthController{
  constructor(private readonly db:DatabaseService){}
  @Get("health") health(){return {status:"ok",service:"views-api"}}
  @Get("readiness") async readiness(){
    try{await this.db.ping();return {status:"ready",database:"ok"}}
    catch{throw new ServiceUnavailableException({status:"not-ready",database:"error"})}
  }
}
