'use strict';
const fs=require('node:fs'),path=require('node:path');
const {Client}=require('pg');
const {localState}=require('./local-state.cjs');
const ORG='74240000-0000-4000-8000-000000000001',PROP='74240000-0000-4000-8000-000000000002',USER='74240000-0000-4000-8000-000000000003',MEMBER='74240000-0000-4000-8000-000000000004';
const POLICY='74240000-0000-4000-8000-000000000005',TYPE='74240000-0000-4000-8000-000000000006',RATE='74240000-0000-4000-8000-000000000009';
const units=[{unitId:'74240000-0000-4000-8000-000000000007',code:'LOCAL-235',ratePlanId:RATE,maxGuests:2},{unitId:'74240000-0000-4000-8000-000000000008',code:'LOCAL-250',ratePlanId:RATE,maxGuests:2}];
(async()=>{
  if(process.argv[2]!=='--ack=LOCAL_SYNTHETIC_WORKSPACE')throw Error('LOCAL_WORKSPACE_ACK_REQUIRED');
  const {privateDir:root,scope}=localState();
  const secret=JSON.parse(fs.readFileSync(path.join(root,'runtime.json'),'utf8'));
  if(secret.scope!==scope)throw Error('LOCAL_SCOPE_REQUIRED');
  const client=new Client({host:'127.0.0.1',port:55432,database:'views_local',user:'views_owner',password:secret.ownerPassword,connectionTimeoutMillis:5000});
  await client.connect();
  try{
    if((await client.query('SELECT count(*)::int AS n FROM views_local_migrations')).rows[0].n<38)throw Error('LOCAL_SCHEMA_NOT_READY');
    await client.query('BEGIN');
    const previous=(await client.query('SELECT legal_name FROM organizations WHERE id=$1',[ORG])).rows[0];
    if(previous&&previous.legal_name!=='VIEWS LOCAL WORKSPACE FIXTURE')throw Error('FIXTURE_ID_CONFLICT');
    await client.query(`INSERT INTO organizations(id,type,legal_name,display_name,country_code,default_currency,timezone)
      VALUES($1,'host','VIEWS LOCAL WORKSPACE FIXTURE','{"ru":"Локальный тест VIEWS"}','UZ','UZS','Asia/Tashkent') ON CONFLICT(id) DO NOTHING`,[ORG]);
    await client.query(`INSERT INTO properties(id,organization_id,name,country_code,city,timezone)
      VALUES($1,$2,'{"ru":"Тестовый NRG U-Tower — не реальный фонд"}','UZ','Tashkent','Asia/Tashkent') ON CONFLICT(id) DO NOTHING`,[PROP,ORG]);
    await client.query(`INSERT INTO users(id,email,display_name,locale,status) VALUES($1,'local-workspace@views.invalid','Локальный тестовый администратор','ru','active') ON CONFLICT(id) DO NOTHING`,[USER]);
    await client.query(`INSERT INTO organization_memberships(id,organization_id,user_id,role_id,status,joined_at)
      SELECT $1,$2,$3,id,'active',now() FROM roles WHERE code='front_desk' ON CONFLICT(id) DO NOTHING`,[MEMBER,ORG,USER]);
    await client.query('INSERT INTO membership_property_scopes(membership_id,property_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[MEMBER,PROP]);
    await client.query(`INSERT INTO cancellation_policy_templates(id,organization_id,code,name,rules)
      VALUES($1,$2,'local-workspace-flex','{"ru":"Тестовая отмена"}','{"rules":[{"minHoursBeforeCheckIn":0,"refundBps":10000}],"nonRefundableLineCodes":[]}') ON CONFLICT(id) DO NOTHING`,[POLICY,ORG]);
    await client.query(`INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{"ru":"Тестовая студия"}',2) ON CONFLICT(id) DO NOTHING`,[TYPE,PROP]);
    for(const unit of units)await client.query('INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',[unit.unitId,PROP,TYPE,unit.code]);
    await client.query(`INSERT INTO rate_plans(id,property_id,unit_type_id,name,currency,base_nightly_minor,cancellation_policy_id)
      VALUES($1,$2,$3,'{"ru":"Тестовый тариф — 650 000 UZS"}','UZS',65000000,$4) ON CONFLICT(id) DO NOTHING`,[RATE,PROP,TYPE,POLICY]);
    const membership=(await client.query(`SELECT m.organization_id,m.user_id,m.status,r.code FROM organization_memberships m JOIN roles r ON r.id=m.role_id WHERE m.id=$1`,[MEMBER])).rows[0];
    if(membership?.organization_id!==ORG||membership.user_id!==USER||!['active','invited','suspended'].includes(membership.status)||membership.code!=='front_desk')throw Error('FIXTURE_ACTOR_CONFLICT');
    await client.query('COMMIT');
    const fixture={schemaVersion:1,scope:'views-local-core-workspace',organizationId:ORG,userId:USER,membershipId:MEMBER,propertyId:PROP,units};
    fs.writeFileSync(path.join(root,'workspace.json'),JSON.stringify(fixture,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify({prepared:true,syntheticData:true,units:units.length,role:'front_desk',publicAccess:false,realPayments:false}));
  }catch(e){await client.query('ROLLBACK');throw e;}finally{await client.end();}
})().catch(e=>{console.error(JSON.stringify({ok:false,code:typeof e.code==='string'?e.code:'LOCAL_WORKSPACE_SETUP_FAILED'}));process.exitCode=1;});
