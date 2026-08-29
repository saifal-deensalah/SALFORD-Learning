// Update the implementation's contract metadata; the original design stays intact.
const fs = require('node:fs');
const path = require('node:path');
const file=path.resolve(__dirname,'../contracts/openapi.json');
const spec=JSON.parse(fs.readFileSync(file,'utf8'));
spec.info.title='SALFORD backendCSC API';
spec.info.version='1.0.0';
spec.info.description='Implemented NestJS API. External identity, billing, SMTP, push and S3 providers need configuration. Development uses embedded PostgreSQL, local email files and private local media. See README.md and docs/verification.md for actual test coverage.';
spec.servers=[{url:'http://127.0.0.1:3000/v1',description:'Local server'},{url:'http://10.0.2.2:3000/v1',description:'Android emulator host'}];
for(const methods of Object.values(spec.paths))for(const operation of Object.values(methods)){
  operation['x-runtime-handler']=operation.operationId;
  if(operation['x-roles'].length===1&&operation['x-roles'][0]==='admin')operation['x-production-admin-header']='X-Admin-Key; routes disabled unless ADMIN_API_ENABLED=true';
}
spec.paths['/admin/plans/{planId}/products'].post.description='Map a provider product. Stripe prices and configured Google products are queried; Apple IDs are provisioned in App Store Connect. Provider-signed purchase verification still gates every entitlement. Currency and charged amounts are not supplied by the client.';
fs.writeFileSync(file,JSON.stringify(spec,null,2)+'\n');
