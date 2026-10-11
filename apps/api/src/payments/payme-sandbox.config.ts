import {validateNetworkRange} from "../security/network-cidr";

export const PAYME_SOURCE_CIDRS=[
  "185.234.113.1/32","185.234.113.2/32","185.234.113.3/32",
  "185.234.113.4/32","185.234.113.5/32","185.234.113.6/32",
  "185.234.113.7/32","185.234.113.8/32","185.234.113.9/32",
  "185.234.113.10/32","185.234.113.11/32","185.234.113.12/32",
  "185.234.113.13/32","185.234.113.14/32","185.234.113.15/32"
] as const;

export type PaymeSandboxConfig={
  enabled:true;
  mode:"sandbox";
  organizationId:string;
  merchantId:string;
  login:string;
  key:string;
  checkoutBaseUrl:"https://test.paycom.uz";
};

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID=/^[a-f0-9]{24}$/i;

export function loadPaymeSandboxConfig(
  env:NodeJS.ProcessEnv=process.env
):PaymeSandboxConfig|null{
  const enabled=env.VIEWS_PAYME_SANDBOX_ENABLED==="true";
  if(!enabled)return null;

  if((env.VIEWS_PAYME_MODE||"sandbox")!=="sandbox"){
    throw new Error("PAYME_PRODUCTION_NOT_ENABLED");
  }

  const organizationId=env.VIEWS_PAYME_ORGANIZATION_ID?.trim()||"";
  const merchantId=env.VIEWS_PAYME_MERCHANT_ID?.trim()||"";
  const login=env.VIEWS_PAYME_MERCHANT_LOGIN?.trim()||"";
  const key=env.VIEWS_PAYME_TEST_KEY?.trim()||"";

  if(!UUID.test(organizationId)){
    throw new Error("VIEWS_PAYME_ORGANIZATION_ID is required");
  }
  if(!OBJECT_ID.test(merchantId)){
    throw new Error("VIEWS_PAYME_MERCHANT_ID must be a 24-character id");
  }
  if(!login||login.length>128||/[\r\n:]/.test(login)){
    throw new Error("VIEWS_PAYME_MERCHANT_LOGIN is invalid");
  }
  if(key.length<16||key.length>256||/[\r\n]/.test(key)){
    throw new Error("VIEWS_PAYME_TEST_KEY is invalid");
  }

  return {
    enabled:true,
    mode:"sandbox",
    organizationId,
    merchantId,
    login,
    key,
    checkoutBaseUrl:"https://test.paycom.uz"
  };
}

export function loadPaymeSourceCidrs(
  env:NodeJS.ProcessEnv=process.env
):readonly string[]{
  if(env.NODE_ENV==="production")return PAYME_SOURCE_CIDRS;

  const raw=env.VIEWS_PAYME_TEST_SOURCE_CIDRS_JSON?.trim();
  if(!raw)return PAYME_SOURCE_CIDRS;

  let value:unknown;
  try{value=JSON.parse(raw)}
  catch{throw new Error("VIEWS_PAYME_TEST_SOURCE_CIDRS_JSON must be valid JSON")}

  if(!Array.isArray(value)||value.length<1||value.length>32){
    throw new Error("VIEWS_PAYME_TEST_SOURCE_CIDRS_JSON must contain CIDRs");
  }
  return value.map(item=>{
    if(typeof item!=="string")throw new Error("VIEWS_PAYME_TEST_SOURCE_CIDRS_JSON must contain CIDRs");
    return validateNetworkRange(item);
  });
}
