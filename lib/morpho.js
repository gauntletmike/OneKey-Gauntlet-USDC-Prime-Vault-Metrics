import { CHAIN_ID, WRAPPER_ADDRESS, GRAPHQL_URL, PAGE_SIZE } from './config.js';
import { fraction, lookThrough, normalizeSeries, units } from './math.js';

const cache = new Map();
const CACHE_MS = 60_000;
export async function graphql(query, variables = {}) {
  const key = JSON.stringify([query, variables]);
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.promise;
  const promise = (async () => {
    const response = await fetch(GRAPHQL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(28_000) });
    const result = await response.json();
    if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join('; '));
    if (!response.ok) throw new Error(`Morpho API returned HTTP ${response.status}`);
    if (!result.data) throw new Error('Morpho API returned no data');
    return { ...result.data, fetchedAt: new Date().toISOString() };
  })();
  cache.set(key, { promise, expires: Date.now() + CACHE_MS });
  if (cache.size > 128) cache.delete(cache.keys().next().value);
  try { return await promise; } catch (error) { cache.delete(key); throw error; }
}

const CORE = `
  address name symbol type listed creationTimestamp creationBlockNumber
  asset { address symbol decimals }
  totalAssets totalAssetsUsd totalSupply liquidity liquidityUsd idleAssets idleAssetsUsd
  sharePrice apy netApy netApyExcludingRewards
  avgNetApy avgNetApyExcludingRewards
  apy7d: avgNetApy(lookback: SEVEN_DAYS)
  apy30d: avgNetApy(lookback: THIRTY_DAYS)
  apy90d: avgNetApy(lookback: NINETY_DAYS)
  performanceFee managementFee performanceFeeRecipient managementFeeRecipient
  owner { address } curator { address }
  allocators { allocator { address } } sentinels { sentinel { address } }
  timelocks { selector functionName duration abdicatedAt }
  gatesConfig {
    sendAssetsGate { address abdicated }
    receiveAssetsGate { address abdicated }
    sendSharesGate { address abdicated }
    receiveSharesGate { address abdicated }
  }
  warnings { type level }
`;
const MARKET = `marketId lltv collateralAsset { address symbol } loanAsset { symbol decimals }
  state { liquidityAssets liquidityAssetsUsd utilization supplyApy timestamp }`;
const CHILD = `${CORE}
  caps(first: 50) { pageInfo { countTotal } items { id type absoluteCap relativeCap allocation data { __typename ... on MarketV1CapData { market { marketId } } } } }
  adapters(first: 10) {
    pageInfo { countTotal }
    items {
      __typename address type assets assetsUsd forceDeallocatePenalty
      ... on MorphoMarketV1Adapter {
        positions(first: 50) { pageInfo { countTotal } items { market { ${MARKET} } state { supplyAssets supplyAssetsUsd } } }
      }
    }
  }
`;
export const SUMMARY_QUERY = `query VaultSummary($address: String!, $chainId: Int!) {
  wrapper: vaultV2ByAddress(address: $address, chainId: $chainId) {
    ${CORE}
    adapters(first: 3) { pageInfo { countTotal } items {
      __typename address type assets assetsUsd forceDeallocatePenalty
      ... on MorphoVaultV2Adapter { innerVault { ${CHILD} } }
      ... on MetaMorphoAdapter { metaMorpho { address name } }
    } }
  }
}`;

export function allocationRows(wrapper, adapter, child) {
  const rows = [];
  let truncated = Number(wrapper.adapters?.pageInfo?.countTotal) > (wrapper.adapters?.items?.length || 0);
  if (!child) return { rows, truncated: false };
  truncated ||= Number(child.adapters?.pageInfo?.countTotal) > (child.adapters?.items?.length || 0);
  const caps = new Map((child.caps?.items || []).filter(c => c.data?.market).map(c => [c.data.market.marketId.toLowerCase(), c]));
  truncated ||= Number(child.caps?.pageInfo?.countTotal) > (child.caps?.items?.length || 0);
  const seen = new Map();
  for (const a of child.adapters?.items || []) {
    if (a.__typename === 'MorphoMarketV1Adapter') {
      truncated ||= Number(a.positions?.pageInfo?.countTotal) > (a.positions?.items?.length || 0);
      for (const p of a.positions?.items || []) {
        if (p.state?.supplyAssets == null) continue;
        const id = p.market.marketId;
        const previous = seen.get(id);
        if (previous) previous.childAssets = (BigInt(previous.childAssets) + BigInt(p.state.supplyAssets)).toString();
        else seen.set(id, { id, name: p.market.collateralAsset?.symbol || 'Idle market', market: p.market, childAssets: String(p.state.supplyAssets), cap: caps.get(id.toLowerCase()) || null, kind: p.market.collateralAsset ? 'market' : 'idle-market' });
      }
    } else {
      rows.push({ id: a.address, name: 'Other adapter', kind: 'adapter', childAssets: String(a.assets), market: null, cap: null });
    }
  }
  rows.push(...seen.values());
  if (BigInt(child.idleAssets || '0') > 0n) rows.push({ id: 'child-idle', name: 'Idle USDC', kind: 'idle', childAssets: String(child.idleAssets), market: null, cap: null });
  for (const row of rows) {
    row.wrapperAssets = lookThrough(adapter.assets, child.totalAssets, row.childAssets);
    row.weight = fraction(row.wrapperAssets, wrapper.totalAssets);
    row.childWeight = fraction(row.childAssets, child.totalAssets);
  }
  if (BigInt(wrapper.idleAssets || '0') > 0n) rows.push({ id: 'wrapper-idle', name: 'Wrapper idle USDC', kind: 'wrapper-idle', wrapperAssets: String(wrapper.idleAssets), childAssets: null, weight: fraction(wrapper.idleAssets, wrapper.totalAssets), childWeight: null, market: null, cap: null });
  rows.sort((a,b) => (BigInt(a.wrapperAssets || '0') > BigInt(b.wrapperAssets || '0') ? -1 : BigInt(a.wrapperAssets || '0') < BigInt(b.wrapperAssets || '0') ? 1 : a.id.localeCompare(b.id)));
  return { rows, truncated };
}

export async function summary() {
  const result = await graphql(SUMMARY_QUERY, { address: WRAPPER_ADDRESS, chainId: CHAIN_ID });
  if (!result.wrapper) throw new Error('The configured wrapper was not found');
  const adapters = result.wrapper.adapters?.items || [];
  const adapter = adapters.find(a => a.innerVault) || adapters[0];
  const child = adapter?.innerVault || null;
  return { wrapper: result.wrapper, adapter, child, allocation: allocationRows(result.wrapper, adapter, child), fetchedAt: result.fetchedAt, chainId: CHAIN_ID };
}

export const HISTORY_QUERY = `query VaultHistory($address: String!, $chainId: Int!, $options: TimeseriesOptions) {
  vaultV2ByAddress(address: $address, chainId: $chainId) {
    creationTimestamp asset { decimals }
    historicalState {
      totalAssets(options: $options) { x y }
      totalAssetsUsd(options: $options) { x y }
      sharePrice(options: $options) { x y }
      avgNetApy(options: $options, lookbackHours: 6) { x y }
    }
  }
}`;
export async function history(days = 90) {
  const end = Math.floor(Date.now() / 1000 / 3600) * 3600;
  const result = await graphql(HISTORY_QUERY, { address: WRAPPER_ADDRESS, chainId: CHAIN_ID, options: { startTimestamp: end - days * 86400, endTimestamp: end, interval: days <= 7 ? 'HOUR' : 'DAY' } });
  const v = result.vaultV2ByAddress, h = v.historicalState;
  const created = Number(v.creationTimestamp);
  const filter = points => (points || []).filter(p => Number(p.x) >= created);
  return { days, series: { assets: normalizeSeries(filter(h.totalAssets), n => units(n,v.asset.decimals)), assetsUsd: normalizeSeries(filter(h.totalAssetsUsd)), sharePrice: normalizeSeries(filter(h.sharePrice)), apy: normalizeSeries(filter(h.avgNetApy)) }, created, fetchedAt: result.fetchedAt };
}
export const HOLDERS_QUERY = `query WrapperHolders($address: String!, $chainId: Int!, $skip: Int!, $first: Int!) {
  vaultV2ByAddress(address: $address, chainId: $chainId) {
    totalSupply totalAssets asset { decimals }
    positions(first: $first, skip: $skip, where: { shares_gte: "1" }) {
      pageInfo { count countTotal skip limit }
      items { user { address } shares assets assetsUsd }
    }
  }
}`;
export async function holders(page = 0) {
  const result = await graphql(HOLDERS_QUERY, { address: WRAPPER_ADDRESS, chainId: CHAIN_ID, first: PAGE_SIZE, skip: page * PAGE_SIZE });
  const v = result.vaultV2ByAddress;
  return { items: v.positions.items.map(p => ({ ...p, weight: fraction(p.shares, v.totalSupply) })), pageInfo: v.positions.pageInfo, assetDecimals: v.asset.decimals, fetchedAt: result.fetchedAt };
}
export const TRANSACTIONS_QUERY = `query WrapperTransactions($first: Int!, $skip: Int!, $where: VaultV2TransactionFilters) {
  vaultV2transactions(first: $first, skip: $skip, orderBy: Time, orderDirection: Desc, where: $where) {
    pageInfo { count countTotal skip limit }
    items { txHash timestamp blockNumber txIndex logIndex type assets shares
      data {
        __typename
        ... on VaultV2DepositData { sender onBehalf }
        ... on VaultV2WithdrawData { sender receiver onBehalf }
        ... on VaultV2TransferData { from to }
      }
    }
  }
}`;
export async function transactions(page = 0, type = 'All', days = 0) {
  const where = { chainId_in: [CHAIN_ID], vaultAddress_in: [WRAPPER_ADDRESS] };
  if (type !== 'All') where.type_in = [type];
  if (days > 0) where.timestamp_gte = Math.floor(Date.now() / 1000 / 60) * 60 - days * 86400;
  const result = await graphql(TRANSACTIONS_QUERY, { first: PAGE_SIZE, skip: page * PAGE_SIZE, where });
  return { ...result.vaultV2transactions, fetchedAt: result.fetchedAt };
}
