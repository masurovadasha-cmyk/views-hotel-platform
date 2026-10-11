'use strict';
// Receipt validation only. This module never opens a DB, starts a browser or sends mail.
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {execFileSync}=require('node:child_process');
const REQUIRED_CHECKS=Object.freeze([
 'queue_idempotency_and_no_raw_tokens',
 'parallel_workers_send_one_real_loopback_SMTP_message',
 'accepted_mail_not_verified_until_token_use_and_capture_never_verifies_email',
 'reset_mail_single_use_revokes_previous_login',
 'superseded_mail_never_sends_and_old_token_cannot_activate',
 'key_tamper_or_missing_key_is_failure_before_SMTP',
 'lease_loss_is_uncertain_and_late_worker_cannot_commit_or_redeliver',
 'known_retry_backoff_is_bounded_and_unknown_delivery_is_not_retried',
 'email_change_invalidates_bound_token_and_pending_message',
 'expired_token_and_offboarded_member_are_not_sent',
 'offboarding_permanently_revokes_accepted_invitation',
 'finish_rechecks_lease_after_waiting_for_row_lock',
 'worker_tenant_filter_and_separation_of_database_privileges',
 'SMTP_receipt_simulation_requires_matching_token_before_verified_flag',
 'audit_is_safe_and_legacy_local_invitation_cannot_claim_email',
 'browser_mail_GET_only_cleans_fragment_without_activation',
 'browser_explicit_activation_login_and_same_tab_reset',
 'browser_consumed_expired_encoded_links_and_reload',
 'passkey_enrollment_requires_password_and_CSRF',
 'passkey_browser_registers_UV_credential',
 'passkey_step_up_after_reload_uses_existing_key',
 'passkey_concurrent_replay_has_one_winner',
 'passkey_wrong_origin_signature_UV_and_challenge_rejected',
 'passkey_expired_and_superseded_challenges_rejected',
 'passkey_challenge_rate_bound',
 'passkey_state_is_tenant_session_bound_and_private',
 'passkey_finish_rechecks_expiry_after_row_lock_wait',
 'passkey_password_reset_and_offboarding_revoke_pending_proofs',
 'recovery_codes_shown_once_and_only_digests_persist',
 'recovery_password_alone_or_invalid_code_cannot_replace_key',
 'recovery_code_concurrent_use_one_winner_failed_enrollment_preserves_key',
 'recovery_browser_new_key_revokes_old_key_codes_and_all_sessions',
 'recovery_rotation_invalidates_old_codes_and_expiry_is_enforced',
 'recovery_replacement_by_existing_key_revokes_backup_codes',
 'recovery_database_failure_rolls_back_key_deletion_and_revocation',
 'recovery_expired_completion_keeps_old_key_and_spent_code_spent',
 'recovery_private_schema_and_audit_do_not_expose_codes',
 'assurance_password_change_requires_same_session_uv_even_via_direct_core',
 'assurance_expiry_after_lock_wait_blocks_mutation',
 'assurance_fresh_uv_allows_one_atomic_change_and_revokes_sessions',
 'password_ui_fixture_enrolls_key',
 'password_ui_clears_closed_form_and_explains_server_assurance_denial',
 'password_ui_cancelled_authenticator_never_submits_password',
 'password_ui_explicit_uv_then_resubmit_revokes_old_sessions',
 'password_ui_lost_success_response_network_does_not_retry_or_claim_failure',
 'password_ui_lost_success_response_server_does_not_retry_or_claim_failure',
 'private_auth_backup_restore_with_separate_keyring'
]);
class EvidenceError extends Error{constructor(code){super(code);this.code=code;}}
const need=(condition,code)=>{if(!condition)throw new EvidenceError(code);};
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
function validateReport(report,sha,now=Date.now()){
 need(/^[a-f0-9]{40}$/.test(sha||''),'SOURCE_SHA_REQUIRED');
 need(report&&typeof report==='object'&&!Array.isArray(report),'REPORT_INVALID');
 need(report.schemaVersion===1&&report.stage==='7.30'&&report.result==='pass','INTEGRATION_NOT_PASSED');
 need(report.sourceCommit===sha&&report.sourceDirty===false,'SOURCE_PROVENANCE_MISMATCH');
 need(!Object.hasOwn(report,'failure')&&!Object.hasOwn(report,'error'),'FAILURE_IN_SUCCESS_REPORT');
 for(const key of ['passkeyVirtualAuthenticator','actualSMTPTransportExercised','SMTPReceiptPositiveBranchSimulated',
   'queueReplaysPrevented','mailerRuntimeSeparated','uncertainDeliveryNotRetried'])need(report[key]===true,'PROOF_FLAG_MISSING');
 need(report.externalEmailsSent===0,'EXTERNAL_EMAIL_NOT_PERMITTED');
 for(const key of ['externalMailboxOwnershipProven','productionEnabled','privilegedMfaEnabled','hostDeploymentConfirmed'])
   need(report[key]===false,'ACTIVATION_BOUNDARY_CHANGED');
 need(Array.isArray(report.checks)&&report.checks.every(v=>typeof v==='string')&&
   new Set(report.checks).size===report.checks.length,'CHECKS_INVALID_OR_DUPLICATED');
 need(report.checkCount===report.checks.length&&integer(report.checkCount,REQUIRED_CHECKS.length,1000),'CHECK_COUNT_INVALID');
 for(const name of REQUIRED_CHECKS)need(report.checks.includes(name),'REQUIRED_SCENARIO_MISSING');
 need(integer(report.httpCalls,1,100000)&&integer(report.smtpMessagesCaptured,1,1000),'ACTUAL_ACTIVITY_MISSING');
 const r=report.restore;
 need(r&&integer(r.tables,1,10000)&&integer(r.privateTables,1,r.tables)&&
   integer(r.recoveryCodeRows,8,1000000)&&r.separateKeyring===true,'RESTORE_PROOF_INCOMPLETE');
 const when=Date.parse(report.checkedAt);
 need(Number.isFinite(when)&&when<=now+300000&&when>=now-21600000,'REPORT_TIME_INVALID');
 need(Array.isArray(report.limitations)&&report.limitations.length>0,'LIMITATIONS_MISSING');
 return {sourceCommit:sha,stage:report.stage,checkCount:report.checkCount,httpCalls:report.httpCalls,
   smtpMessagesCaptured:report.smtpMessagesCaptured,restore:r,checkedAt:report.checkedAt,
   externalEmailsSent:0,productionEnabled:false};
}
function validateTap(text){
 need(typeof text==='string'&&text.startsWith('TAP version 13'),'TAP_REQUIRED');
 const counts={};
 for(const name of ['tests','pass','fail','cancelled','skipped','todo']){
   const matches=[...text.matchAll(new RegExp('^# '+name+' (\\d+)\\r?$','gm'))];
   need(matches.length===1,'TAP_SUMMARY_INVALID');counts[name]=Number(matches[0][1]);
 }
 need(integer(counts.tests,1,100000)&&counts.tests===counts.pass&&
   counts.fail===0&&counts.cancelled===0&&counts.skipped===0&&counts.todo===0&&!/^not ok /m.test(text),
   'UNIT_TESTS_NOT_PASSED');
 return {tests:counts.tests,passed:counts.pass};
}
function readBounded(filename){
 const stat=fs.lstatSync(filename);
 need(stat.isFile()&&!stat.isSymbolicLink()&&stat.size>0&&stat.size<=1048576,'EVIDENCE_FILE_INVALID');
 return fs.readFileSync(filename,'utf8');
}
function validateDirectory(directory,sha,now=Date.now()){
 const unit=readBounded(path.join(directory,'unit.tap'));
 const gate=readBounded(path.join(directory,'gate.tap'));
 const json=readBounded(path.join(directory,'integration.json'));
 let report;try{report=JSON.parse(json);}catch{throw new EvidenceError('REPORT_JSON_INVALID');}
 return {schemaVersion:1,result:'pass',...validateReport(report,sha,now),unit:validateTap(unit),gate:validateTap(gate),
   integrationSha256:createHash('sha256').update(json).digest('hex')};
}
if(require.main===module){
 const directory=process.argv[2]||'mail-evidence',out=path.join(directory,'validated.json');
 try{
   fs.rmSync(out,{force:true});
   const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
   need(process.env.GITHUB_SHA===head,'CI_CHECKOUT_SHA_MISMATCH');
   need(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()==='','CHECKOUT_DIRTY');
   const validated=validateDirectory(directory,head);
   fs.writeFileSync(out,JSON.stringify(validated,null,2)+'\n',{mode:0o600});
   console.log(JSON.stringify(validated));
 }catch(error){
   console.error(JSON.stringify({result:'fail',code:error instanceof EvidenceError?error.code:'EVIDENCE_UNAVAILABLE'}));
   process.exitCode=1;
 }
}
module.exports={REQUIRED_CHECKS,EvidenceError,validateReport,validateTap,validateDirectory};
