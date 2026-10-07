'use strict';
const fs=require('node:fs');
const REQUIRED=[
 'existing_authenticated_session_and_booking_on_schema_0040',
 'wrong_source_refused_without_stopping_existing_app',
 'checksum_mismatch_refused_before_downtime',
 'actual_operator_rollout_stops_backs_up_migrates_builds_restarts',
 'existing_password_session_booking_and_applied_checksums_preserved',
 'second_rollout_is_safe_without_reapplying_migrations',
 'reservation_can_be_released_after_upgrade_without_payment'
];
function validate(report,sha){
 const errors=[];
 if(!/^[a-f0-9]{40}$/.test(sha||'')||report?.sourceCommit!==sha)errors.push('SOURCE_MISMATCH');
 if(report?.schemaVersion!==1||report?.kind!=='windows-rollout-e2e'||report?.result!=='pass')errors.push('RESULT_INVALID');
 if(!Array.isArray(report?.checks)||report.checks.length!==REQUIRED.length||new Set(report.checks).size!==REQUIRED.length||REQUIRED.some(x=>!report.checks.includes(x))||report.checkCount!==REQUIRED.length)errors.push('SCENARIOS_INCOMPLETE');
 if(report?.initialDatabaseMigrationCount!==40||report?.initialApplicationIsCurrentSource!==true)errors.push('BASELINE_UNCLEAR');
 for(const [key,pending] of [['firstRollout',4],['secondRollout',0]]){
  const r=report?.[key];
  if(r?.result!=='pass'||r?.sourceCommit!==sha||r?.phase!=='local-staging-ready'||r?.migrationsAfter!==44||!Array.isArray(r?.pendingMigrationsBefore)||r.pendingMigrationsBefore.length!==pending||r?.pendingMigrationsAfter?.length!==0)errors.push('ROLLOUT_INVALID:'+key);
  if(r?.backup?.contentDigestMatch!==true||r?.backup?.sameExportedSnapshot!==true||!Number.isInteger(r?.backup?.privateTableCount)||r.backup.privateTableCount<4||!Number.isInteger(r?.backup?.tableCount)||r.backup.tableCount<60||!/^[a-f0-9]{64}$/.test(r?.backup?.sha256||''))errors.push('BACKUP_INVALID:'+key);
  if(r?.passkeyPilot?.enabled!==true||r?.passkeyPilot?.sessionRequired!==true||r?.coreReady!==true||r?.webReady!==true||r?.localPhysicalPasskeyTested!==false||r?.productionEnabled!==false||r?.externalEmailSent!==false||r?.publicTunnel!==false)errors.push('RUNTIME_BOUNDARY_INVALID:'+key);
 }
 if(report?.firstRollout?.backup?.file===report?.secondRollout?.backup?.file)errors.push('REUSED_BACKUP');
 if(report?.cleanupListenersClosed!==true||report?.cleanupWebFailed||report?.cleanupCoreOrPgFailed||report?.authenticatedPasskeyStateAvailable!==true)errors.push('CLEANUP_OR_AUTH_INVALID');
 if(report?.userHostModified!==false||report?.realPayments!==false||report?.physicalPasskeyTested!==false||report?.externalEmailsSent!==0)errors.push('BOUNDARY_INVALID');
 if(!Number.isInteger(report?.httpRequests)||report.httpRequests<10)errors.push('HTTP_EVIDENCE_INCOMPLETE');
 return {ok:errors.length===0,errors,sourceCommit:sha};
}
module.exports={validate,REQUIRED};
if(require.main===module){try{const report=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),result=validate(report,process.argv[3]);console.log(JSON.stringify(result));process.exitCode=result.ok?0:1;}catch{console.error('INVALID_WINDOWS_E2E_REPORT');process.exitCode=2;}}
