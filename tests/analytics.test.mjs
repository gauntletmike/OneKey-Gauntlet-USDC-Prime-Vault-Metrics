import test from 'node:test';
import assert from 'node:assert/strict';
import { units, fraction, lookThrough, normalizeSeries } from '../lib/math.js';
import { allocationRows } from '../lib/morpho.js';
import { getPayload } from '../api/vault.js';

test('asset units and ownership ratios do not lose raw integer precision', () => {
  assert.equal(units('13251308735',6),13251.308735);
  assert.equal(units('1000000000000000000',18),1);
  assert.equal(fraction('100000000000000000000000000000000000','400000000000000000000000000000000000'),.25);
  assert.equal(units(null),null);
  assert.equal(fraction('1','0'),null);
  assert.equal(lookThrough('100','0','1'),null);
});
test('look-through allocations reconcile with wrapper TVL and retain shared market liquidity', () => {
  const market=(id,name,liquidity)=>({marketId:id,collateralAsset:{symbol:name},state:{liquidityAssets:liquidity}});
  const wrapper={totalAssets:'10000000000',idleAssets:'200000000',adapters:{items:[{}],pageInfo:{countTotal:1}}};
  const adapter={assets:'9800000000'};
  const child={totalAssets:'1000000000000',idleAssets:'100000000000',caps:{items:[]},adapters:{items:[{__typename:'MorphoMarketV1Adapter',positions:{items:[{market:market('btc','cbBTC','500000000000'),state:{supplyAssets:'800000000000'}},{market:market('eth','WETH','60000000000'),state:{supplyAssets:'100000000000'}}],pageInfo:{countTotal:2}}}],pageInfo:{countTotal:1}}};
  const result=allocationRows(wrapper,adapter,child);
  assert.equal(result.truncated,false);
  assert.equal(result.rows.reduce((n,r)=>n+BigInt(r.wrapperAssets),0n),10000000000n);
  assert.equal(result.rows.find(r=>r.id==='btc').wrapperAssets,'7840000000');
  assert.equal(result.rows.find(r=>r.id==='btc').market.state.liquidityAssets,'500000000000');
  assert.equal(result.rows.find(r=>r.id==='wrapper-idle').weight,.02);
});
test('API page truncation is flagged instead of displaying a complete portfolio', () => {
  const wrapper={totalAssets:'10',idleAssets:'0',adapters:{items:[{}],pageInfo:{countTotal:1}}};
  const child={totalAssets:'100',idleAssets:'0',adapters:{items:[],pageInfo:{countTotal:2}}};
  assert.equal(allocationRows(wrapper,{assets:'10'},child).truncated,true);
});
test('null historical values are not turned into zero balances or yields', () => {
  assert.deepEqual(normalizeSeries([{x:2,y:null},{x:3,y:0},{x:1,y:1}]),[{x:1,y:1},{x:3,y:0}]);
});
test('invalid actions, pagination, and filters never reach the upstream API', async () => {
  for(const params of [{action:'arbitrary-query'},{action:'holders',page:'-1'},{action:'transactions',type:'Injected'},{action:'history',days:'999'},{action:'transactions',days:'15'}]) {
    await assert.rejects(getPayload(new URLSearchParams(params)),/Unknown action|Invalid/);
  }
});
