import { createHash } from 'crypto';
import { z } from 'zod';
export { typedRequest,operatorJobKinds,MAX_OPERATOR_BYTES } from './operatorSchema';
const uuid=z.string().uuid(),project=z.string().regex(/^c[a-f0-9]{8}$/);
export function digest(body:string){return createHash('sha256').update(body,'utf8').digest('hex');}
export function credentialDigest(token:string){return digest('hms-operator-v1:'+token);}
export const receipt=z.object({delivery_id:uuid,claim_id:uuid,body_sha256:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['queued','applied','rejected','recovery_required']),local_id:z.number().int().positive().nullable(),project:project.nullable()}).strict();


