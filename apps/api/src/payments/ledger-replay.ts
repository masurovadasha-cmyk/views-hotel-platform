import type {PoolClient} from 'pg';
export type LedgerLineIdentity={code:string;side:'debit'|'credit';amountMinor:bigint;currency:string};
function canonical(lines:LedgerLineIdentity[]){return lines.map(l=>JSON.stringify([l.code,l.side,l.amountMinor.toString(),l.currency])).sort();}
/** Serializes one ledger command and verifies the material content of old
 * journals too; no fingerprint backfill or mutation of posted history. */
export async function ledgerReplay(client:PoolClient,input:{organizationId:string;idempotencyKey:string;referenceType:string;referenceId:string;lines:LedgerLineIdentity[]}){
 if(!input.idempotencyKey||input.idempotencyKey.length>200)throw Error('INVALID_LEDGER_KEY');
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ledger:'+input.organizationId+':'+input.idempotencyKey]);
 const old=(await client.query<{id:string;status:string;reference_type:string;reference_id:string}>('SELECT id,status,reference_type,reference_id FROM ledger_journals WHERE organization_id=$1 AND idempotency_key=$2',[input.organizationId,input.idempotencyKey])).rows[0];
 if(!old)return null;
 if(old.status!=='posted'||old.reference_type!==input.referenceType||old.reference_id!==input.referenceId)throw Error('LEDGER_IDEMPOTENCY_CONFLICT');
 const entries=(await client.query<{code:string;side:'debit'|'credit';amount_minor:string;currency:string}>(`SELECT a.code,e.side,e.amount_minor::text,e.currency FROM ledger_entries e JOIN ledger_accounts a ON a.id=e.account_id AND a.organization_id=$2 WHERE e.journal_id=$1 LIMIT $3`,[old.id,input.organizationId,input.lines.length+1])).rows;
 const actual=canonical(entries.map(e=>({code:e.code,side:e.side,amountMinor:BigInt(e.amount_minor),currency:e.currency})));
 if(JSON.stringify(actual)!==JSON.stringify(canonical(input.lines)))throw Error('LEDGER_IDEMPOTENCY_CONFLICT');
 return old.id;
}
