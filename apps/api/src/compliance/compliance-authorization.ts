import type {PoolClient} from "pg";

export async function assertComplianceRole(
  client:PoolClient,
  _membershipId:string,
  allowed:string[]
){
  const result=await client.query<{code:string|null}>(
    "SELECT app.current_membership_role() AS code"
  );
  const role=result.rows[0]?.code;
  if(!role||!allowed.includes(role)){
    throw new Error("COMPLIANCE_ROLE_FORBIDDEN");
  }
}
