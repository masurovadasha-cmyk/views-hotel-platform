import type {PoolClient} from "pg";

export async function assertComplianceRole(
  client:PoolClient,
  membershipId:string,
  allowed:string[]
){
  const result=await client.query<{code:string}>(
    `SELECT r.code
       FROM organization_memberships m
       JOIN roles r ON r.id=m.role_id
      WHERE m.id=$1 AND m.status='active'`,
    [membershipId]
  );
  if(!result.rows[0]||!allowed.includes(result.rows[0].code)){
    throw new Error("COMPLIANCE_ROLE_FORBIDDEN");
  }
}
