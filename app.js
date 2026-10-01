import { units, fraction } from './lib/math.js';

const WRAPPER = '0xefA40C84F1F2335a8599dD7686A28D2b6263B6ef';
const DEAD = '0x000000000000000000000000000000000000dead';
const ZERO = '0x0000000000000000000000000000000000000000';
const colors = ['#438aff','#46c6ac','#b093e8','#e7ba69','#c183b5','#708a9e'];
const state = { summary: null, summaryError: '', tab: 'overview', days: 90, currency: 'usd', history: new Map(), historyErrors: new Map(), historyLoading: new Set(), holders: null, holdersError: '', holderPage: 0, holderLoading: false, transactions: null, txError: '', txPage: 0, txType: 'All', txDays: 0, txLoading: false, riskScope: 'wrapper' };
const $ = s => document.querySelector(s);
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (n, decimals = 2) => n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('en-US',{ maximumFractionDigits:decimals,minimumFractionDigits:decimals });
const compact = n => n == null || !Number.isFinite(Number(n)) ? '—' : Number(n).toLocaleString('en-US',{ notation:'compact',maximumFractionDigits:2 });
const usd = (n,short = false) => n == null || !Number.isFinite(Number(n)) ? '—' : '$' + (short ? compact(n) : num(n));
const pct = (n,d=2) => n == null ? '—' : `${num(n * 100,d)}%`;
const short = a => `${a.slice(0,6)}…${a.slice(-4)}`;
const validAddress = a => /^0x[0-9a-fA-F]{40}$/.test(a || '');
const addr = a => !validAddress(a) ? '—' : `<span class="address-inline"><a href="https://basescan.org/address/${E(a)}" target="_blank" rel="noopener noreferrer" title="${E(a)}">${E(short(a))} <span class="external">↗</span></a><button class="copy" data-copy="${E(a)}" aria-label="Copy address ${E(short(a))}" title="Copy address">▣</button></span>`;
const day = timestamp => new Date(Number(timestamp) * 1000).toLocaleDateString('en-US',{ year:'numeric',month:'short',day:'numeric',timeZone:'UTC' });
const utc = timestamp => new Date(Number(timestamp) * 1000).toISOString().replace('T',' ').slice(0,19);
const usdc = () => '<span class="token-icon">$</span>';
const coin = symbol => `<span class="coin ${symbol.includes('ETH')?'eth':''}" title="${E(symbol)}">${E(symbol === 'cbBTC' ? 'BTC' : symbol === 'wstETH' ? 'wst' : symbol === 'cbETH' ? 'cbE' : symbol)}</span>`;
const amount = raw => units(raw,state.summary?.wrapper.asset.decimals ?? 6);
const kv = (label,value) => `<div class="kv"><span>${E(label)}</span><span>${value}</span></div>`;
const empty = (text, action='') => `<div class="empty"><span>${E(text)}</span>${action?`<button class="retry" data-retry="${action}">Retry</button>`:''}</div>`;
const duration = seconds => {
  if (seconds == null) return '—';
  const n = Number(seconds);
  if (n === 0) return 'No delay';
  if(n%86400===0)return `${n/86400} day${n===86400?'':'s'}`;
  if(n%3600===0)return `${n/3600} hour${n===3600?'':'s'}`;
  return `${num(n/60,0)} minutes`;
};
function rangeControl() { return `<select class="select" data-control="range" aria-label="Chart time range">${[[7,'7 days'],[30,'1 month'],[90,'3 months'],[365,'All history']].map(([v,label])=>`<option value="${v}" ${state.days===v?'selected':''}>${label}</option>`).join('')}</select>`; }
function segment() { return `<div class="segmented" aria-label="TVL denomination"><button data-currency="usdc" class="${state.currency==='usdc'?'selected':''}" aria-pressed="${state.currency==='usdc'}">USDC</button><button data-currency="usd" class="${state.currency==='usd'?'selected':''}" aria-pressed="${state.currency==='usd'}">USD</button></div>`; }
function chartShell(key,label,format) {
  const data = state.history.get(state.days);
  if (!data) return state.historyErrors.has(state.days) ? empty('Chart history is temporarily unavailable.','history') : `<div class="chart-skeleton skeleton" aria-label="Loading ${E(label)} history"></div>`;
  const points = chartPoints(key);
  if (!points.length) return empty('No indexed history for this period.');
  return chart(points,label,format,key);
}
function chartPoints(key) {
  const sampled=state.history.get(state.days)?.series[key] || [];
  if(!sampled.length || !state.summary)return sampled;
  const v=state.summary.wrapper;
  const value=({assets:amount(v.totalAssets),assetsUsd:v.totalAssetsUsd,sharePrice:v.sharePrice,apy:v.avgNetApy})[key];
  const timestamp=Math.floor(new Date(state.summary.fetchedAt).getTime()/1000);
  // A separate current snapshot prevents a daily chart ending before today's flows.
  if(value!=null && timestamp>sampled.at(-1).x)return [...sampled,{x:timestamp,y:value,current:true}];
  return sampled;
}
function chart(points,label,format,key) {
  const mobile=window.innerWidth<=600;
  const contentWidth=Math.min(1280,window.innerWidth)-(mobile?36:72);
  const panelWidth=contentWidth-(mobile?36:58)-2;
  const W=Math.max(280,key==='apy'&&window.innerWidth>900?(panelWidth-28)*1.7/2.7:panelWidth);
  const H=mobile?210:230,L=8,R=W<500?72:95,T=16,B=32,w=W-L-R,h=H-T-B;
  const ys=points.map(p=>p.y), lo=Math.min(...ys),hi=Math.max(...ys), span=hi-lo || Math.abs(hi)*.01 || 1;
  const ymin=lo-span*.15, ymax=hi+span*.15;
  const xlo=points[0].x,xhi=points.at(-1).x;
  const x = p=>L+(xhi===xlo?.5:(p.x-xlo)/(xhi-xlo))*w;
  const y = p=>T+(1-(p.y-ymin)/(ymax-ymin))*h;
  const path=points.map((p,i)=>`${i?'L':'M'}${x(p).toFixed(2)},${y(p).toFixed(2)}`).join(' ');
  const area=path+` L${x(points.at(-1))},${T+h} L${x(points[0])},${T+h} Z`;
  const axis=[.2,.5,.8].map(t=>{const v=ymin+(ymax-ymin)*t,py=T+h-h*t;return `<line x1="${L}" x2="${W-R+8}" y1="${py}" y2="${py}" stroke="#343a40" stroke-width="1"/><text x="${W-R+17}" y="${py+4}">${E(format(v))}</text>`;}).join('');
  const dates=[0,.25,.5,.75,1].map(t=>{const xx=L+w*t,ts=xlo+(xhi-xlo)*t;return `<text x="${xx}" y="${H-3}" text-anchor="${t===0?'start':t===1?'end':'middle'}">${E(new Date(ts*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}))}</text>`;}).join('');
  return `<div class="chart" data-chart="${key}" data-width="${W}" data-plot-width="${w}" data-xlo="${xlo}" data-xhi="${xhi}"><svg role="img" aria-label="${E(label)}, ${E(day(xlo))} through ${E(day(xhi))}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="gradient-${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#438aff" stop-opacity=".2"/><stop offset="1" stop-color="#438aff" stop-opacity=".025"/></linearGradient></defs>${axis}<path d="${area}" fill="url(#gradient-${key})"/><path d="${path}" fill="none" stroke="#438aff" stroke-width="2" vector-effect="non-scaling-stroke"/>${points.length===1?`<circle cx="${x(points[0])}" cy="${y(points[0])}" r="4" fill="#438aff"/>`:''}${dates}</svg><div class="chart-tooltip" hidden></div></div>`;
}
function chartTvl() {
  const v=state.summary.wrapper,key=state.currency==='usd'?'assetsUsd':'assets';
  return `<div class="panel"><div class="chart-header"><div><div class="label">Total deposits (${state.currency==='usd'?'USD':'USDC'})</div><div class="big-value">${state.currency==='usd'?usd(v.totalAssetsUsd,true):compact(amount(v.totalAssets))}</div></div><div class="chart-controls">${segment()}${rangeControl()}</div></div>${chartShell(key,'Total deposits',n=>state.currency==='usd'?usd(n,true):compact(n))}<p class="chart-caption">OneKey wrapper TVL, including accrued yield. Historical samples plus the latest API snapshot.</p></div>`;
}
function chartApy() {
  const {wrapper:v,child:c}=state.summary;
  return `<div class="panel"><div class="apy-layout"><div><div class="chart-header"><div><div class="label">Net APY</div><div class="big-value">${pct(v.avgNetApy)}</div></div>${rangeControl()}</div>${chartShell('apy','Net APY',n=>pct(n))}</div><div class="apy-breakdown"><h3>Yield & fees</h3><div class="kv-list">${kv('Wrapper net APY (6h)',pct(v.avgNetApy))}${kv('Native net APY (6h)',pct(v.avgNetApyExcludingRewards))}${kv('Underlying net APY (6h)',pct(c?.avgNetApy))}${kv('Wrapper performance fee',pct(v.performanceFee))}${kv('Wrapper management fee',pct(v.managementFee))}${kv('Underlying performance fee',pct(c?.performanceFee))}</div><p class="hint">Wrapper APY is reported after both layers of fees. Performance fees apply to yield; management fees are annual.</p></div></div></div>`;
}
function overview() {
  const {wrapper:v,child:c,adapter:a}=state.summary;
  return `<div class="two-cols"><div class="panel"><h3>Vault configuration</h3><div class="kv-list">${kv('Morpho vault version','Vault V2')}${kv('Vault deployment date',E(day(v.creationTimestamp)))}${kv('Deposit asset',`${usdc()} &nbsp;${E(v.asset.symbol)}`)}${kv('Wrapper contract',addr(v.address))}</div></div><div class="panel"><h3>Underlying strategy</h3><div class="kv-list">${kv('Vault',c?`<a href="${vaultLink(c.address)}" target="_blank" rel="noopener noreferrer">${E(c.name)} <span class="external">↗</span></a>`:E(a?.metaMorpho?.name || 'Not indexed'))}${kv('Underlying vault TVL',usd(c?.totalAssetsUsd,true))}${kv('Underlying contract',addr(c?.address || a?.metaMorpho?.address))}${kv('Capital allocation',pct(fraction(a?.assets,v.totalAssets)))}</div></div></div>${chartTvl()}${chartApy()}`;
}
function vaultLink(a) { return validAddress(a)?`https://app.morpho.org/base/vault/${a}`:'#'; }
function allocation() {
  const {wrapper:v,child:c,adapter:a,allocation:al}=state.summary;
  const rows=al.rows;
  const direct=`<div class="panel"><div class="section-heading"><h3>Direct allocation</h3><span class="tag">OneKey wrapper</span></div><div class="allocation-link"><div class="allocation-main">${usdc()}<div><h3>${E(c?.name || a?.metaMorpho?.name || 'Underlying vault')}</h3><p>${addr(c?.address || a?.metaMorpho?.address)}</p></div></div><div class="allocation-amount">${num(amount(a?.assets))}<small>USDC · ${pct(fraction(a?.assets,v.totalAssets))} of wrapper TVL</small></div></div><div class="bar"><span style="width:${Math.min(100,100*(fraction(a?.assets,v.totalAssets)||0))}%"></span></div></div>`;
  if(!c)return direct+`<div class="notice">The underlying allocation is not available from this API response.</div>`;
  const bar=`<div class="bar">${rows.filter(r=>r.weight>0).map((r,i)=>`<span style="width:${r.weight*100}%;background:${colors[i%colors.length]}"></span>`).join('')}</div><div class="legend">${rows.filter(r=>r.weight>.00001).map((r,i)=>`<span><i style="background:${colors[i%colors.length]}"></i>${E(r.name)} ${pct(r.weight)}</span>`).join('')}</div>`;
  return `${direct}<div class="section-heading"><div><h2>Underlying market exposure</h2><p>Proportional exposure through ${E(c.name)}</p></div><a class="tag" href="${vaultLink(c.address)}#allocation" target="_blank" rel="noopener noreferrer">Open underlying vault ↗</a></div><div class="notice">OneKey allocation is estimated from its share of the underlying vault. Market liquidity and supply caps below belong to the underlying markets and vault.</div>${al.truncated?'<div class="notice error">Some underlying positions exceed the API page limits. This allocation view is incomplete.</div>':''}<div class="panel" style="padding-top:18px;padding-bottom:18px">${bar}</div><div class="panel no-pad"><div class="table-wrap"><table><thead><tr><th>Market exposure</th><th class="number">OneKey allocation · USDC</th><th class="number">% of OneKey TVL</th><th class="number">Underlying allocation · USDC</th><th class="number">Market liquidity · USDC</th><th class="number">Market absolute cap · USDC</th></tr></thead><tbody>${rows.map(r=>`<tr><td><div class="market">${usdc()}${r.market?.collateralAsset?`<span class="muted">|</span>${coin(r.name)}<a href="https://app.morpho.org/base/market/${E(r.id)}" target="_blank" rel="noopener noreferrer" title="${E(r.id)}">${E(r.name)}</a><span class="pill">${pct(units(r.market.lltv,18),0)} LLTV</span>`:`<span>${E(r.name)}</span>`}</div></td><td class="number">${r.wrapperAssets!=null?num(amount(r.wrapperAssets),3):'—'}</td><td class="number">${pct(r.weight)}</td><td class="number">${r.childAssets!=null?compact(amount(r.childAssets)):'—'}</td><td class="number">${compact(amount(r.market?.state?.liquidityAssets))}</td><td class="number">${r.cap?compact(amount(r.cap.absoluteCap)):'—'}</td></tr>`).join('')}</tbody></table></div></div><p class="table-footnote">Estimated exposure = wrapper assets invested in the underlying vault × market allocation ÷ underlying vault total assets. Small differences can arise from rounding and API snapshots. Market absolute caps are one layer of the underlying vault’s limits; collateral, adapter, and relative caps can also apply. Liquidity is shared and can change.</p>`;
}
function performance() {
  const v=state.summary.wrapper,series=chartPoints('sharePrice');
  const gain=series.length>1 && series[0].y>0 ? series.at(-1).y/series[0].y-1 : null;
  return `<div class="panel"><div class="chart-header"><div><div class="label">Position unit price (USDC)</div><div class="big-value">${num(v.sharePrice,6)}${gain!=null?`<span class="gain ${gain<0?'negative':''}">${gain>=0?'+':''}${pct(gain)}</span>`:''}</div></div>${rangeControl()}</div>${chartShell('sharePrice','Share price',n=>num(n,5))}<p class="chart-caption">USDC per whole wrapper share, as reported by Morpho. Change runs from the first historical sample to the latest API snapshot in the selected period.</p></div><div class="section-heading"><h3>Returns</h3></div><div class="returns">${[['Instant net APY',v.netApy],['7D net APY',v.apy7d],['30D net APY',v.apy30d],['90D net APY',v.apy90d]].map(([label,value])=>`<div class="return-cell"><span>${E(label)}</span><strong>${pct(value)}</strong></div>`).join('')}</div><p class="table-footnote">Annualized rates reported by Morpho, after fees. A period with insufficient history may show no value. APY is variable.</p>`;
}
function roles(v) {
  return [['Owner',[v.owner?.address]],['Curator',[v.curator?.address]],['Allocator',(v.allocators||[]).map(a=>a.allocator.address)],['Sentinel',(v.sentinels||[]).map(a=>a.sentinel.address)]].map(([label,addresses])=>`<div class="role-group"><span>${E(label)}</span><div class="role-addresses">${addresses.length?addresses.map(addr).join(''):'<span class="muted">None reported</span>'}</div></div>`).join('');
}
function risk() {
  const v=state.riskScope==='underlying'?state.summary.child:state.summary.wrapper;
  const controls=`<div class="scope-tabs" aria-label="Risk configuration scope"><button data-risk="wrapper" class="${state.riskScope==='wrapper'?'selected':''}" aria-pressed="${state.riskScope==='wrapper'}">OneKey wrapper</button><button data-risk="underlying" class="${state.riskScope==='underlying'?'selected':''}" aria-pressed="${state.riskScope==='underlying'}" ${!state.summary.child?'disabled':''}>Underlying USDC Prime</button></div>`;
  if(!v)return controls+empty('Underlying risk configuration is not indexed.');
  const gates=[['Deposit gate','sendAssetsGate'],['Asset receipt gate','receiveAssetsGate'],['Share sending gate','sendSharesGate'],['Share receipt gate','receiveSharesGate']];
  return `${controls}${(v.warnings||[]).length?`<div class="notice">Morpho API notices: ${v.warnings.map(w=>`${E(w.type.replaceAll('_',' '))} (${E(w.level)})`).join(' · ')}</div>`:''}<div class="two-cols"><div class="panel"><h3>Vault roles</h3><div class="kv-list">${roles(v)}</div><p class="hint">Roles belong to ${E(v.name)}. Explorer links show the actual contracts and addresses.</p></div><div class="panel"><h3>Fees & access</h3><div class="kv-list">${kv('Performance fee',pct(v.performanceFee))}${kv('Management fee',pct(v.managementFee))}${kv('Performance fee recipient',addr(v.performanceFeeRecipient))}${kv('Management fee recipient',addr(v.managementFeeRecipient))}${gates.map(([label,key])=>{const gate=v.gatesConfig?.[key];return kv(label,!gate?'Not reported':(!gate.address||gate.address.toLowerCase()===ZERO)?`<span class="badge gray">No gate</span> ${gate.abdicated?'<span class="badge">Setter abdicated</span>':''}`:addr(gate.address));}).join('')}</div></div></div><div class="section-heading"><h3>Function timelocks</h3><span class="tiny">${E(v.name)}</span></div><div class="panel no-pad"><div class="table-wrap"><table><thead><tr><th>Function</th><th>Selector</th><th class="number">Timelock</th></tr></thead><tbody>${v.timelocks?.length?v.timelocks.map(t=>`<tr><td>${E(t.functionName)}</td><td class="muted">${E(t.selector)}</td><td class="number">${t.abdicatedAt!=null?'<span class="badge">Abdicated</span>':E(duration(t.duration))}</td></tr>`).join(''):'<tr><td colspan="3" class="muted">No function timelocks reported.</td></tr>'}</tbody></table></div></div><p class="table-footnote">Abdication permanently disables that configuration function. Wrapper and underlying vault permissions are separate.</p>`;
}
function pagination(kind,page,total) {
  const pages=Math.max(1,Math.ceil(Number(total || 0)/10));
  return `<div class="pagination"><button data-page="${kind}" data-delta="-1" ${page===0?'disabled':''} aria-label="Previous ${kind} page">‹</button><span>${page+1} of ${pages}</span><button data-page="${kind}" data-delta="1" ${page+1>=pages?'disabled':''} aria-label="Next ${kind} page">›</button></div>`;
}
function holderTable() {
  const data=state.holders;
  if(!data)return empty(state.holdersError || 'Loading holder balances…',state.holdersError?'holders':'');
  if(!data.items.length)return empty('No funded holders in this page.');
  return `<div class="table-wrap"><table><thead><tr><th>Holder</th><th class="number">Balance · USDC</th><th class="number">USD value</th><th class="number">% of shares</th></tr></thead><tbody>${data.items.map(p=>`<tr><td><div class="table-wallet"><span class="holder-avatar" style="--av1:#${E(p.user.address.slice(2,8))};--av2:#${E(p.user.address.slice(-6))}"></span>${addr(p.user.address)}${p.user.address.toLowerCase()===DEAD?'<span class="pill">Dead deposit</span>':''}</div></td><td class="number">${num(units(p.assets,data.assetDecimals),3)}</td><td class="number">${usd(p.assetsUsd)}</td><td class="number"><span class="percent"><i class="mini-ring" style="--fill:${Math.min(100,Math.max(0,(p.weight||0)*100))}%"></i>${pct(p.weight)}</span></td></tr>`).join('')}</tbody></table></div>`;
}
function txControls() {
  return `<div class="chart-controls"><select class="select" data-control="tx-days" aria-label="Transaction date range">${[[0,'All time'],[7,'Last 7 days'],[30,'Last 30 days'],[90,'Last 90 days']].map(([v,l])=>`<option value="${v}" ${v===state.txDays?'selected':''}>${l}</option>`).join('')}</select><select class="select" data-control="tx-type" aria-label="Transaction type">${['All','Deposit','Withdraw','Transfer'].map(t=>`<option value="${t}" ${t===state.txType?'selected':''}>${({All:'All types',Deposit:'Deposits',Withdraw:'Withdrawals',Transfer:'Transfers'})[t]}</option>`).join('')}</select></div>`;
}
function txTable() {
  const data=state.transactions;
  if(!data)return empty(state.txError || 'Loading transactions…',state.txError?'transactions':'');
  if(!data.items.length)return empty('No transactions match these filters.');
  return `<div class="table-wrap"><table><thead><tr><th>Date · UTC</th><th>Type</th><th class="number">Amount · USDC</th><th>Share owner</th><th>Transaction</th></tr></thead><tbody>${data.items.map(t=>{const d=t.data,transfer=t.type==='Transfer';return `<tr><td class="date-cell">${E(utc(t.timestamp))}</td><td><span class="tx-type"><i class="tx-dot ${t.type.toLowerCase()}"></i>${E(t.type)}</span></td><td class="number">${transfer?'—':num(amount(t.assets),3)}${transfer?`<div class="tiny">${num(units(t.shares,18),6)} shares</div>`:''}</td><td>${transfer?`<div class="tiny">From ${addr(d.from)}</div><div class="tiny">To ${addr(d.to)}</div>`:`<span title="Caller: ${E(d.sender)}${d.receiver?' · Receiver: '+E(d.receiver):''}">${addr(d.onBehalf)}</span>`}</td><td><a href="https://basescan.org/tx/${E(t.txHash)}" target="_blank" rel="noopener noreferrer" title="${E(t.txHash)}">${E(short(t.txHash))} <span class="external">↗</span></a></td></tr>`;}).join('')}</tbody></table></div>`;
}
function activity() {
  return `<div class="panel no-pad"><div class="table-header"><div><h3>User distribution</h3><p>${state.holders?`${num(state.holders.pageInfo.countTotal,0)} funded addresses · `:''}OneKey wrapper shares</p></div><span class="tag">Wrapper only</span></div>${holderTable()}</div>${state.holders?pagination('holders',state.holderPage,state.holders.pageInfo.countTotal):''}<p class="table-footnote">Balances include accrued yield. Distribution uses share ownership and includes any dead deposit or fee recipient holding shares. Addresses may represent individual wallets or pooled accounts.</p><div class="panel no-pad"><div class="table-header"><div><h3>All transactions</h3><p>Wrapper activity · dates in UTC</p></div>${txControls()}</div>${txTable()}</div>${state.transactions?pagination('transactions',state.txPage,state.transactions.pageInfo.countTotal):''}<p class="table-footnote">Deposit and withdrawal users are the share owner, which can differ from the transaction caller or asset receiver. Transfers move shares and are not counted as USDC deposits or withdrawals.</p>`;
}
function renderMetrics() {
  if(!state.summary)return;
  const {wrapper:v,allocation:a}=state.summary;
  const exposure=[...new Set(a.rows.filter(r=>r.weight>0 && r.market?.collateralAsset).map(r=>r.name))];
  $('#metrics').innerHTML=`<div class="metric"><span>Total deposits</span><strong>${usd(v.totalAssetsUsd,true)}</strong><small>${num(amount(v.totalAssets))} USDC</small></div><div class="metric"><span title="Liquidity reported by Morpho for the wrapper’s withdrawal path">Available liquidity</span><strong>${usd(v.liquidityUsd,true)}</strong><small>${num(amount(v.liquidity))} USDC</small></div><div class="metric"><span title="6-hour rolling average, after fees and including API-reported rewards">Net APY</span><strong>${pct(v.avgNetApy)}</strong><small>6h average · after fees</small></div><div class="metric"><span>Exposure</span><strong class="exposure-tokens">${exposure.length?exposure.map(coin).join(''):'—'}</strong><small>Underlying collateral</small></div>`;
  const fetched=new Date(state.summary.fetchedAt);
  $('#updated').textContent='Fetched '+fetched.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
  $('#updated').title='API fetch time; indexing may lag on-chain activity. '+fetched.toISOString();
  $('#status').innerHTML=state.summaryError?`<div class="notice error">The latest refresh failed. Showing data fetched ${E(fetched.toLocaleString())}. <button class="retry" data-retry="summary">Retry</button></div>`:'';
}
function render() {
  $('#tabs').querySelectorAll('a').forEach(a=>{const active=a.dataset.tab===state.tab;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if(!state.summary){if(state.summaryError)$('#view').innerHTML=`<div class="panel">${empty(state.summaryError,'summary')}</div>`;return;}
  renderMetrics();
  $('#view').innerHTML=({overview,allocation,performance,risk,activity}[state.tab]||overview)();
  bindCharts();
}
function bindCharts() {
  document.querySelectorAll('[data-chart]').forEach(el=>{
    el.addEventListener('pointermove',event=>{
      const key=el.dataset.chart,points=chartPoints(key);
      if(!points?.length)return;
      const rect=el.getBoundingClientRect(),ratio=Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*Number(el.dataset.width)-8)/Number(el.dataset.plotWidth)));
      const target=points[0].x+ratio*(points.at(-1).x-points[0].x);
      const p=points.reduce((best,q)=>Math.abs(q.x-target)<Math.abs(best.x-target)?q:best);
      const tip=el.querySelector('.chart-tooltip');tip.hidden=false;
      const value=key==='assetsUsd'?usd(p.y):key==='apy'?pct(p.y):num(p.y,key==='sharePrice'?6:2)+(key==='apy'?'':' USDC');
      tip.innerHTML=`${E(day(p.x))}${p.current?' · Latest snapshot':''}<strong>${E(value)}</strong>`;
      tip.style.left=Math.max(75,Math.min(rect.width-75,event.clientX-rect.left))+'px';tip.style.top='80px';
    });
    el.addEventListener('pointerleave',()=>{el.querySelector('.chart-tooltip').hidden=true;});
  });
}
async function api(params) {
  const response=await fetch('/api/vault?'+new URLSearchParams(params),{signal:AbortSignal.timeout(50_000),cache:'no-store'});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error || 'Vault data is temporarily unavailable.');
  return result;
}
async function loadSummary() {
  $('#refresh').disabled=true;$('#refresh').innerHTML='<span class="status-spinner">↻</span>';
  try{state.summary=await api({action:'summary'});state.summaryError='';}
  catch(error){state.summaryError=error.message;}
  finally{$('#refresh').disabled=false;$('#refresh').textContent='↻';render();}
}
async function loadHistory(force=false) {
  const days=state.days;if(state.historyLoading.has(days)||(!force&&state.history.has(days)))return;
  state.historyLoading.add(days);state.historyErrors.delete(days);
  try{state.history.set(days,await api({action:'history',days}));}
  catch(error){state.historyErrors.set(days,error.message);}
  finally{state.historyLoading.delete(days);if(state.days===days)render();}
}
async function loadHolders() {
  const page=state.holderPage;state.holderLoading=true;state.holdersError='';
  try{const result=await api({action:'holders',page});if(page===state.holderPage)state.holders=result;}
  catch(error){if(page===state.holderPage)state.holdersError=error.message;}
  finally{if(page===state.holderPage){state.holderLoading=false;if(state.tab==='activity')render();}}
}
async function loadTransactions() {
  const page=state.txPage,type=state.txType,days=state.txDays;state.txLoading=true;state.txError='';
  const current=()=>page===state.txPage&&type===state.txType&&days===state.txDays;
  try{const result=await api({action:'transactions',page,type,days});if(current())state.transactions=result;}
  catch(error){if(current())state.txError=error.message;}
  finally{if(current()){state.txLoading=false;if(state.tab==='activity')render();}}
}
function navigate() {
  const tab=location.hash.slice(1);state.tab=['overview','allocation','performance','risk','activity'].includes(tab)?tab:'overview';render();
  if(['overview','performance'].includes(state.tab))loadHistory();
  if(state.tab==='activity'){if(!state.holders&&!state.holderLoading)loadHolders();if(!state.transactions&&!state.txLoading)loadTransactions();}
}
document.addEventListener('click',async event=>{
  const copy=event.target.closest('[data-copy]');
  if(copy){try{await navigator.clipboard.writeText(copy.dataset.copy);copy.textContent='✓';copy.title='Copied';setTimeout(()=>{if(copy.isConnected){copy.textContent='▣';copy.title='Copy address';}},1500);}catch{copy.title='Copy unavailable, select the full address from the explorer link';}return;}
  const currency=event.target.closest('[data-currency]');if(currency){state.currency=currency.dataset.currency;render();return;}
  const scope=event.target.closest('[data-risk]');if(scope){state.riskScope=scope.dataset.risk;render();return;}
  const retry=event.target.closest('[data-retry]');if(retry){const action=retry.dataset.retry;if(action==='summary')loadSummary();if(action==='history')loadHistory(true);if(action==='holders')loadHolders();if(action==='transactions')loadTransactions();return;}
  const page=event.target.closest('[data-page]');if(page&&!page.disabled){const delta=Number(page.dataset.delta);if(page.dataset.page==='holders'){state.holderPage+=delta;state.holders=null;loadHolders();}else{state.txPage+=delta;state.transactions=null;loadTransactions();}render();}
});
document.addEventListener('change',event=>{
  const control=event.target.dataset.control;
  if(control==='range'){state.days=Number(event.target.value);render();loadHistory();}
  if(control==='tx-days'||control==='tx-type'){if(control==='tx-days')state.txDays=Number(event.target.value);else state.txType=event.target.value;state.txPage=0;state.transactions=null;render();loadTransactions();}
});
$('#refresh').addEventListener('click',()=>{loadSummary();if(['overview','performance'].includes(state.tab))loadHistory(true);if(state.tab==='activity'){loadHolders();loadTransactions();}});
window.addEventListener('hashchange',navigate);
let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(render,80);});
$('#vault-address').innerHTML=addr(WRAPPER);
navigate();
loadSummary();
setInterval(()=>{if(document.visibilityState==='visible')loadSummary();},60_000);
