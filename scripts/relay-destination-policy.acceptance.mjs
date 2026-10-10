import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {evaluateRelayDestinationPolicy as check} from './relay-destination-policy-gate.mjs';
const source=readFileSync('infra/egress/squid.conf','utf8');
test('reviewed relay destination policy passes',()=>assert.equal(check(source).ok,true));
for(const line of ['http_access deny views_forbidden_v4','http_access deny views_forbidden_v6',
  'http_access deny !views_core','http_access deny !CONNECT','http_access deny !SSL_ports',
  'http_access deny !views_allowed','http_access deny all']){
  test('removing security rule fails: '+line,()=>assert.equal(check(source.replace(line,'' )).ok,false));
}
for(const range of ['127.0.0.0/8','169.254.0.0/16','10.0.0.0/8','172.16.0.0/12','192.168.0.0/16','::1/128','fc00::/7','fe80::/10']){
  test('removing protected range fails: '+range,()=>assert.equal(check(source.replace(range,'' )).ok,false));
}
test('reverse DNS cannot be enabled unnoticed',()=>assert.equal(check(source.replace('dstdomain -n','dstdomain')).ok,false));
test('additional allow all fails',()=>assert.equal(check('http_access allow all\n'+source).ok,false));
test('private-IP deny after allow fails',()=>{
  const changed=source.replace('http_access deny views_forbidden_v4\n','')+'\nhttp_access deny views_forbidden_v4\n';
  assert.equal(check(changed).ok,false);
});
test('unreviewed include/helper directives fail',()=>assert.equal(check(source+'\ninclude /tmp/untrusted.conf\n').ok,false));
test('only comments and whitespace may change without policy review',()=>assert.equal(check('# comment\n'+source.replace('http_port 3128','http_port    3128')).ok,true));
