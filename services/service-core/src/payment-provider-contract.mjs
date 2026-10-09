/**
 * Provider adapter boundary. No real provider credentials, endpoints or signature
 * algorithms are assumed. Implement each provider only from its official contract.
 */
const supported=new Set(["payme","click","uzum"]);
export function assertPaymentProvider(provider){
 if(!supported.has(provider))throw Error("Unsupported payment provider");
 return provider;
}
export function requireVerifiedNotification({provider,verified,providerEventId,intentId,amountUzs,currency}){
 assertPaymentProvider(provider);
 if(verified!==true)throw Error("Unverified provider notification");
 if(typeof providerEventId!=="string"||!providerEventId||typeof intentId!=="string"||!intentId)throw Error("Invalid provider identifiers");
 if(!Number.isSafeInteger(amountUzs)||amountUzs<=0||currency!=="UZS")throw Error("Invalid provider amount");
 return {provider,providerEventId,intentId,amountUzs,currency};
}
/**
 * Never call payment-events.applyVerifiedPaymentEvent until an adapter:
 * 1) authenticates the provider; 2) checks intent provider and amount;
 * 3) reconciles event status with the provider; 4) rejects replays.
 */
