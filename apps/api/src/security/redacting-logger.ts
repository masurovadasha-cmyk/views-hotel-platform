import {ConsoleLogger} from "@nestjs/common";

const sensitiveKey=/^(authorization|cookie|set-cookie|token|currentPassword|newPassword|invitationToken|password_hash|x-views-staff-session|accessToken|exchangeToken|password|secret|email|phone|phone_e164|x-views-internal-key|x-views-service-token|VIEWS_CORE_SIGNING_PRIVATE_KEY|privateKey|privateKeyPem)$/i;
const bearer=/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi;
const guestToken=/\bvg[ae]_[A-Za-z0-9_-]{8,}\b/g;
const email=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phone=/(?<!\w)\+[1-9]\d{7,14}(?!\w)/g;

export function redactSecurityText(value:string){
  return value
    .replace(bearer,"Bearer [REDACTED]")
    .replace(guestToken,"[GUEST_TOKEN_REDACTED]")
    .replace(email,"[EMAIL_REDACTED]")
    .replace(phone,"[PHONE_REDACTED]");
}

export function redactTelemetryValue(value:unknown,seen=new WeakSet<object>()):unknown{
  if(typeof value==="string")return redactSecurityText(value);
  if(value===null||value===undefined||typeof value!=="object")return value;

  if(value instanceof Error){
    return {
      name:value.name,
      message:redactSecurityText(value.message),
      stack:value.stack?redactSecurityText(value.stack):undefined
    };
  }

  if(seen.has(value))return "[CIRCULAR]";
  seen.add(value);

  if(Array.isArray(value)){
    return value.map(item=>redactTelemetryValue(item,seen));
  }

  const result:Record<string,unknown>={};
  for(const [key,item] of Object.entries(value as Record<string,unknown>)){
    result[key]=sensitiveKey.test(key)
      ?"[REDACTED]"
      :redactTelemetryValue(item,seen);
  }
  return result;
}

export class RedactingLogger extends ConsoleLogger{
  log(message:any,...optionalParams:any[]){
    super.log(redactTelemetryValue(message),...optionalParams.map(v=>redactTelemetryValue(v)));
  }
  error(message:any,...optionalParams:any[]){
    super.error(redactTelemetryValue(message),...optionalParams.map(v=>redactTelemetryValue(v)));
  }
  warn(message:any,...optionalParams:any[]){
    super.warn(redactTelemetryValue(message),...optionalParams.map(v=>redactTelemetryValue(v)));
  }
  debug(message:any,...optionalParams:any[]){
    super.debug(redactTelemetryValue(message),...optionalParams.map(v=>redactTelemetryValue(v)));
  }
  verbose(message:any,...optionalParams:any[]){
    super.verbose(redactTelemetryValue(message),...optionalParams.map(v=>redactTelemetryValue(v)));
  }
  fatal(message:any,...optionalParams:any[]){
    super.fatal(redactTelemetryValue(message),...optionalParams.map(v=>redactTelemetryValue(v)));
  }
}
