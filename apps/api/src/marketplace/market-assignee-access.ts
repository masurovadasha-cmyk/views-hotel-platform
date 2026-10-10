import type {PoolClient} from "pg";

export async function validateMarketAssignee(
 client:Pick<PoolClient,"query">,
 input:{organizationId:string;propertyId:string;assigneeMembershipId:string}
):Promise<void>{
 const result=await client.query<{allowed:boolean}>(
  `SELECT EXISTS(
     SELECT 1 FROM organization_memberships m
     JOIN roles r ON r.id=m.role_id
     WHERE m.id=$1 AND m.organization_id=$2 AND m.status='active'
       AND (
         r.code IN ('owner','manager')
         OR EXISTS(
           SELECT 1 FROM membership_property_scopes s
           WHERE s.membership_id=m.id AND s.property_id=$3
         )
       )
   ) AS allowed`,
  [input.assigneeMembershipId,input.organizationId,input.propertyId]
 );
 if(!result.rows[0]?.allowed)throw Error("MARKET_ASSIGNEE_FORBIDDEN");
}
