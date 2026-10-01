import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePages} from '../src/tools.js';
test('page ranges match the desktop one-based selection',()=>{
  assert.deepEqual(parsePages('1,3,5-7',7),[0,2,4,5,6]);
  assert.deepEqual(parsePages('',3),[0,1,2]);
  assert.deepEqual(parsePages('1,1,2',2),[0,1]);
  for(const bad of ['0','4','3-1','1,,2','hello'])assert.throws(()=>parsePages(bad,3));
});
