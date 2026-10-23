import test from 'node:test';import assert from 'node:assert/strict';
import {extractBankStatementPhysicalColumns,extractPnbPhysicalColumns} from './bank-statement-pdf-columns.mjs';
import {reconcileBankStatementMarkdownAmounts} from './bank-statement-markdown-amounts.mjs';
import {buildBankVoucherXml} from '../../tally-bridge/src/bridge.mjs';
const item=(str,x,y,width=40)=>({str,width,transform:[1,0,0,1,x,y]});
const headers=[item('Txn No.',80,700),item('Txn Date',180,700),item('Description',380,700),item('Dr Amount',680,700),item('Cr Amount',780,700),item('Balance',880,700)];
const row=(ref,y,debit,credit,balance)=>[item(ref,65,y,70),item('03-09-2026',165,y,70),item(`Narration ${ref}`,350,y,180),...(debit?[item(debit,660,y,85)]:[]),...(credit?[item(credit,760,y,85)]:[]),item(balance,860,y,85)];

test('currency headings, month-name dates and bank reference columns survive sparse continuation pages', () => {
 const head=[item('Date',47,790,17),item('Transaction description',98,790,90),item('Bank reference',244,790,58),item('Debit (INR)',348,790,41),item('Credit (INR)',418,790,44),item('Balance (INR)',488,790,52)];
 const rows=[item('09-Oct-26',47,765,32),item('Bank commission / service charge',98,764,121),item('-',244,765,2),item('20.05',389,765,19),item('1362428.17',516,765,44),
 item('09-Oct-26',47,740,32),item('Credit from Suspense',98,739,78),item('123261009018',244,740,48),item('50.01',459,740,19),item('1362478.18',516,740,44),
 item('Transactions: 2 | Total debit',42,705,170)];
 const physical=extractBankStatementPhysicalColumns([{pageNumber:2,width:595,items:[...head,...rows]}]);
 assert.deepEqual(physical.rows.map(row=>[row.reference,row.sourceDate,row.narration,row.debitAmount,row.creditAmount,row.balanceAmount]),[
  ['', '09-Oct-26', 'Bank commission / service charge',20.05,null,1362428.17],
  ['123261009018','09-Oct-26','Credit from Suspense',null,50.01,1362478.18]
 ]);
});
test('headerless continuation preserves physical columns and wrapped decimals through XML',()=>{
 const pages=[{pageNumber:1,width:1000,items:[...headers,...row('T123456',600,'20,98,696.00',null,'9,65,64,682.49Dr.')]},
 {pageNumber:2,width:1000,items:[...row('T29161971',1100,null,null,'9,44,65,986.49Dr.'),item('1,00,00,000.0',660,1108,85),item('0',737,1092,8),...row('T24969455',1020,null,'2,50,000.00','8,44,65,986.49Dr.')]}];
 const physical=extractPnbPhysicalColumns(pages);assert.equal(physical.rows.length,3);
 assert.equal(physical.rows[1].narration,'Narration T29161971');
 const parsed={transactions:[{reference_number:'T29161971',credit_amount:10000000,debit_amount:null,category:'receipt'}, {reference_number:'T24969455',credit_amount:null,debit_amount:250000,category:'payment'}]};
 const fixed=reconcileBankStatementMarkdownAmounts(parsed,'',physical);
 assert.deepEqual(fixed.transactions.map(r=>[r.debit_amount,r.credit_amount,r.category]),[[10000000,null,'payment'],[null,250000,'receipt']]);
 for(const tx of fixed.transactions){const type=tx.debit_amount?'Payment':'Receipt';const xml=buildBankVoucherXml({voucherType:type,voucherDate:'2026-09-03',bankLedgerName:'PNB',counterpartyLedgerName:'Party',amount:tx.debit_amount||tx.credit_amount},'Test');
 assert.ok(xml.includes(`<VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>`));
 const bank=xml.match(/<ALLLEDGERENTRIES.LIST><LEDGERNAME>PNB<\/LEDGERNAME>[\s\S]*?<\/ALLLEDGERENTRIES.LIST>/)?.[0];
 assert.ok(bank.includes(`<AMOUNT>${tx.debit_amount?'10000000.00':'-250000.00'}</AMOUNT>`));}
});
test('changed layout, duplicate references and ambiguous amounts fail verification',()=>{
 const first={pageNumber:1,width:1000,items:[...headers,...row('T123456',600,'100.00',null,'1000.00')]};
 assert.throws(()=>extractPnbPhysicalColumns([first,{pageNumber:2,width:900,items:[]}]),/width changed/);
 assert.throws(()=>extractPnbPhysicalColumns([first,{pageNumber:2,width:1000,items:row('T123456',600,'100.00',null,'1000.00')}]),/duplicated/);
 assert.throws(()=>extractPnbPhysicalColumns([{...first,items:[...headers,...row('T123456',600,'100.00','100.00','1000.00')]}]),/incomplete/);
 assert.equal(extractPnbPhysicalColumns([{pageNumber:1,width:1000,items:[]}]).detected,false);
});
test('PNB accepts the real S and U reference families',()=>{
 const page={pageNumber:1,width:1000,items:[...headers,...row('S3692997',600,'400.00',null,'1000.00'),...row('U89691391',520,null,'500.00','1500.00')]};
 assert.deepEqual(extractPnbPhysicalColumns([page]).rows.map(entry=>entry.reference),['S3692997','U89691391']);
});
test('Central Bank uses physical debit and credit columns even with blank cheque references',()=>{
 const centralHeaders=[item('Post Date',50,700,60),item('Value',120,700,30),item('Transaction Description',300,700,120),item('Debit',530,700,35),item('Credit',620,700,35),item('Balance',710,700,45)];
 const centralRow=(y,narration,debit,credit,balance)=>[
  item('05/09/2026',50,y,55),item('05/09/2026',120,y,55),item(narration,300,y,100),
  ...(debit?[item(debit,525,y,55)]:[]),...(credit?[item(credit,615,y,55)]:[]),item(balance,700,y,85),
 ];
 const physical=extractBankStatementPhysicalColumns([{pageNumber:1,width:842,items:[...centralHeaders,...centralRow(620,'First narration',null,'783200.00','343974486.98 DR'),...centralRow(590,'Second narration','100.00',null,'343974586.98 DR')]}]);
 assert.equal(physical.layout,'central_bank');assert.equal(physical.matchByOrder,false);
 assert.deepEqual(physical.rows.map(entry=>[entry.sourceDate,entry.narration]),[['05/09/2026','First narration'],['05/09/2026','Second narration']]);
 assert.deepEqual(physical.rows.map(entry=>[entry.debitAmount,entry.creditAmount,entry.balanceAmount]),[[null,783200,-343974486.98],[100,null,-343974586.98]]);
 const fixed=reconcileBankStatementMarkdownAmounts({transactions:[
  {reference_number:null,transaction_date:'2026-09-05',description:'First narration',debit_amount:783200,credit_amount:null,category:'payment'},
  {reference_number:null,transaction_date:'2026-09-05',description:'Second narration',debit_amount:null,credit_amount:100,category:'receipt'},
 ]},'',physical);
 assert.deepEqual(fixed.transactions.map(entry=>[entry.debit_amount,entry.credit_amount,entry.category]),[[null,783200,'receipt'],[100,null,'payment']]);
});
test('generic statement headings get deterministic physical row evidence',()=>{
 const genericHeaders=[item('Date',50,700,60),item('Particulars',260,700,100),item('Withdrawal',520,700,60),item('Deposit',620,700,50),item('Balance',710,700,45)];
 const physical=extractBankStatementPhysicalColumns([{pageNumber:1,width:842,items:[
  ...genericHeaders,item('05/09/2026',50,620,55),item('Customer receipt',260,620,120),item('1250.00',615,620,55),item('5000.00',700,620,70),
 ]}]);
 assert.equal(physical.layout,'generic_statement');
 assert.deepEqual(physical.rows.map(row=>[row.sourceDate,row.narration,row.debitAmount,row.creditAmount,row.balanceAmount]),[
  ['05/09/2026','Customer receipt',null,1250,5000],
 ]);
});
test('HDFC layout keeps wrapped narrations with their row and drops the page footer',()=>{
 const head=[item('Date',40,602,16),item('Narration',144,602,34),item('Chq./Ref.No.',284,602,45),item('Value Dt',362,602,30),item('Withdrawal Amt.',405,602,60),item('Deposit Amt.',491,602,45),item('Closing Balance',564,602,55)];
 const physical=extractBankStatementPhysicalColumns([{pageNumber:1,width:638,items:[
  ...head,
  item('07/08/26',34,584,28),item('UPI-AUTOPAY-GOOGLE',68,584,89),item('0000750084052196',293,584,64),item('07/08/26',362,584,28),item('2.00',456,584,14),item('279,716.94',591,584,36),
  item('WORKSPACE',68,567,60),item('MANDATEEXECUTE',68,550,80),
  item('08/08/26',34,533,28),item('NEFT CR-ACME',68,533,70),item('AXISCN1',293,533,50),item('08/08/26',362,533,28),item('2,999.00',520,533,28),item('282,715.94',591,533,36),
  item('*Closing balance includes funds earmarked for hold',34,500,200),
 ]}]);
 assert.deepEqual(physical.rows.map(r=>[r.sourceDate,r.narration,r.reference,r.debitAmount,r.creditAmount,r.balanceAmount]),[
  ['07/08/26','UPI-AUTOPAY-GOOGLE WORKSPACE MANDATEEXECUTE','0000750084052196',2,null,279716.94],
  ['08/08/26','NEFT CR-ACME','AXISCN1',null,2999,282715.94],
 ]);
});
test('Narration/Description + Reference/UTR layout stops before the totals line',()=>{
 const head=[item('Date',50,397,16),item('Narration / Description',118,397,78),item('Reference / UTR',391,397,56),item('Withdrawal',569,397,38),item('Deposit',669,397,26),item('Balance',764,397,28)];
 const physical=extractBankStatementPhysicalColumns([{pageNumber:1,width:842,items:[
  ...head,
  item('12 Jul 2026',50,372,40),item('RTGS CR FRM VARDHN',118,372,120),item('HDFX260712901',391,372,59),item('-',605,373,2),item('118,000.00',658,373,38),item('1,086,585.90',748,373,44),
  item('12 Jul 2026',50,348,40),item('ATM CASH WDL',118,348,59),item('MCB-ATM-909',391,348,116),item('10,000.00',574,349,33),item('-',693,349,2),item('1,076,585.90',748,349,44),
  item('Transaction totals',118,324,66),item('85,826.00',574,325,33),item('310,250.00',658,325,38),
 ]}]);
 assert.deepEqual(physical.rows.map(r=>[r.narration,r.debitAmount,r.creditAmount,r.balanceAmount]),[
  ['RTGS CR FRM VARDHN',null,118000,1086585.9],['ATM CASH WDL',10000,null,1076585.9]]);
});
