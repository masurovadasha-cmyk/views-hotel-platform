'use strict';
// Add one isolated complimentary synthetic stay; never reset existing bookings.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {Client}=require('pg'),{localState}=require('./local-state.cjs');
(async()=>{
 if(process.argv.length>4||(process.argv[3]&&!['--without-guest','--document-statuses','--document-preview'].includes(process.argv[3])))throw Error('INVALID_STAY_FIXTURE_OPTION');
 if(process.argv[2]!=='--ack=LOCAL_SYNTHETIC_STAY')throw Error('LOCAL_STAY_ACK_REQUIRED');
 const {privateDir,scope}=localState(),secret=JSON.parse(fs.readFileSync(path.join(privateDir,'runtime.json'),'utf8'));
 if(secret.scope!==scope)throw Error('LOCAL_SCOPE_REQUIRED');
 const org='74240000-0000-4000-8000-000000000001',prop='74240000-0000-4000-8000-000000000002',type='74240000-0000-4000-8000-000000000006';
 const db=new Client({host:'127.0.0.1',port:55432,database:'views_local',user:'views_owner',password:secret.ownerPassword,connectionTimeoutMillis:5000});await db.connect();
 try{
  await db.query('BEGIN');
  if((await db.query('SELECT legal_name FROM organizations WHERE id=$1',[org])).rows[0]?.legal_name!=='VIEWS LOCAL WORKSPACE FIXTURE')throw Error('FIXTURE_REQUIRED');
  const id=randomUUID(),unit=randomUUID(),code='LOCAL-STAY-'+id.slice(0,8);
  await db.query('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$4)',[unit,prop,type,code]);
  await db.query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot,quote_snapshot,confirmed_at)
   VALUES($1,$2,$3,$4,$5,'confirmed',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 day','UZS',0,'{}','{"localStayPilot":true}',clock_timestamp())`,[id,org,prop,unit,code]);
  await db.query("INSERT INTO inventory_periods(organization_id,property_id,unit_id,kind,reservation_id,stay_period) SELECT organization_id,property_id,unit_id,'reservation',id,tstzrange(check_in_at,check_out_at,'[)') FROM reservations WHERE id=$1",[id]);
  if(process.argv[3]!=='--without-guest')await db.query("INSERT INTO reservation_guests(organization_id,reservation_id,is_primary,first_name,last_name,date_of_birth,nationality_country_code) VALUES($1,$2,true,'Synthetic','Local Stay','2000-01-01','UZ')",[org,id]);
  if(process.argv[3]==='--document-statuses')await db.query(`INSERT INTO guest_document_records(organization_id,reservation_guest_id,document_type,object_key,storage_region,vault_id,verification_status,expires_on,object_checksum_sha256)
   SELECT g.organization_id,g.id,'passport','synthetic/not-an-upload','UZ','unconnected-synthetic',d.status::document_verification_status,d.expiry,d.checksum
   FROM reservation_guests g CROSS JOIN (VALUES
    ('pending',NULL::date,NULL::text),('pending',NULL::date,repeat('a',64)),('rejected',NULL::date,repeat('b',64)),('verified',DATE '2000-01-01',repeat('c',64))
   ) d(status,expiry,checksum) WHERE g.reservation_id=$1 AND g.is_primary`,[id]);
  if(process.argv[3]==='--document-preview'){
   const {SYNTHETIC_VAULT,sealSyntheticDocument}=require('../dist/compliance/synthetic-document-vault.js');
   const guest=(await db.query('SELECT id FROM reservation_guests WHERE reservation_id=$1 AND is_primary',[id])).rows[0];
   const doc=randomUUID(),sealed=sealSyntheticDocument({organizationId:org,reservationId:id,guestId:guest.id,documentId:doc},secret.documentVaultKey||'');
   await db.query("INSERT INTO guest_document_records(id,organization_id,reservation_guest_id,document_type,encrypted_fields,object_checksum_sha256,storage_region,vault_id,encryption_key_ref) VALUES($1,$2,$3,'other',$4,$5,'LOCAL_SYNTHETIC',$6,'local-synthetic-v1')",[doc,org,guest.id,sealed.encrypted,sealed.checksum,SYNTHETIC_VAULT]);
  }
  await db.query('COMMIT');console.log(JSON.stringify({reservationId:id,confirmationCode:code,syntheticData:true,paymentsCreated:0}));
 }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
})().catch(e=>{console.error(JSON.stringify({result:'fail',code:e.code||'LOCAL_STAY_FIXTURE_FAILED'}));process.exitCode=1;});
