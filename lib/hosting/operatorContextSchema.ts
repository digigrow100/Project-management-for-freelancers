import {z} from 'zod';
const uuid=z.string().uuid(),rawKey=z.string().regex(/^[A-Za-z0-9_-]{43}=$/);
export const operatorContextSchema=z.object({
 schema:z.literal(1),job_id:uuid,idempotency_key:uuid,actor_id:uuid,service_id:uuid,client_id:uuid,server_id:uuid,
 tenant:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),subject:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
 project:z.string().regex(/^c[a-f0-9]{8}$/).nullable(),kind:z.enum(['provision','suspend','resume','deploy','cancel','configure']),
 host_key:rawKey,member_key:rawKey.nullable(),server_time:z.number().int().positive().safe(),expires:z.number().int().positive().safe()
}).strict();
export type OperatorSigningContext=z.infer<typeof operatorContextSchema>;
