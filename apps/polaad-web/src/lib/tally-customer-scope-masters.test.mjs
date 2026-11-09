import test from 'node:test';
import assert from 'node:assert/strict';
import {readCustomerScopeMasters} from './tally-customer-scope-masters.ts';

test('reads the canonical nested catalogue sent by current connectors', () => {
  const groups = [{name:'Sundry Debtors',parent:'Current Assets'}];
  const ledgers = [{name:'Arvind Industrial Components',parent:'Sundry Debtors'}];
  assert.deepEqual(readCustomerScopeMasters({masters:{groups,ledgers},totals:{group:1}}),{groups,ledgers});
});

test('supports older flat catalogues and normalizes group names and parents', () => {
  assert.deepEqual(readCustomerScopeMasters({groups:[{name:' Sundry Debtors ',parent:' Current Assets '},null,{name:''}],ledgers:[]}),
    {groups:[{name:'Sundry Debtors',parent:'Current Assets'}],ledgers:[]});
});

test('an empty or malformed refresh fails before replacing the displayed list', () => {
  for(const payload of [{},{masters:{groups:[]}},{masters:{groups:'not an array'}},{groups:[null,{name:' '}]}]) {
    assert.throws(()=>readCustomerScopeMasters(payload),/no account groups/);
  }
  assert.throws(()=>readCustomerScopeMasters({masters:{groups:[]},groups:[{name:'Old cached group'}]}),/no account groups/);
});
