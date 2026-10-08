import assert from 'node:assert/strict';
import { blobStore } from '../netlify/functions/room.mjs';

let writes = 0;
const error = new Error('temporary storage failure');
const store = blobStore({
  async setJSON(_key, _value, options) {
    writes++;
    if (options?.onlyIfMatch) throw error;
    return {modified:true};
  }
});
await assert.rejects(store.write('room-test', {moves:[1]}, 'v1'), error);
assert.equal(writes, 1, 'storage failure must never cause an unconditional overwrite');
console.log('ok storage failures preserve conditional writes');

let seen;
const adapter = blobStore({async setJSON(key,value,options) { seen=options; return {modified:false}; }});
assert.equal(await adapter.write('room-test',{},'etag'),false);
assert.deepEqual(seen,{onlyIfMatch:'etag'});
assert.equal(await adapter.write('room-test',{},null),false);
assert.deepEqual(seen,{onlyIfNew:true});
console.log('ok conflicting writes remain retryable and create stays conditional');
await assert.rejects(adapter.write('room-test',{},undefined), /etag/);
await assert.rejects(adapter.write('room-test',{},''), /etag/);
console.log('ok missing etag cannot trigger an unconditional overwrite');

for (const etag of ['', undefined]){
  const phantom = blobStore({async setJSON(){ return {modified:true, etag}; }});
  for (const previous of [null, 'v1']){
    await assert.rejects(phantom.write('room-test',{},previous), /not confirmed/);
  }
}
const confirmed = blobStore({async setJSON(){ return {modified:true,etag:'v2'}; }});
assert.equal(await confirmed.write('room-test',{},'v1'),true);
console.log('ok phantom SDK successes cannot acknowledge a lost write');
