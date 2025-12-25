import {  useMemo, useState } from 'react';
import type{ FormEvent } from 'react';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Contract, ethers } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { FACTORY_ABI, FACTORY_ADDRESS, TOKEN_ABI, ZERO_ADDRESS } from '../config/contracts';
import '../styles/Launchpad.css';

type CatalogToken = {
  token: `0x${string}`;
  name: string;
  symbol: string;
  maxSupply: bigint;
  pricePerToken: bigint;
  creator: string;
  saleSupply: bigint;
};

type BalanceHandle = {
  address: `0x${string}`;
  handle: `0x${string}`;
};

const DEFAULT_SUPPLY = 1_000_000_000n;

export function TokenLaunchpad() {
  const { address, isConnected } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading } = useZamaInstance();

  const [formState, setFormState] = useState({ name: '', symbol: '', supply: '', price: '0.001' });
  const [creating, setCreating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [buyAmount, setBuyAmount] = useState<Record<string, string>>({});
  const [buying, setBuying] = useState<Record<string, boolean>>({});
  const [decrypting, setDecrypting] = useState<Record<string, boolean>>({});
  const [decryptedBalances, setDecryptedBalances] = useState<Record<string, string>>({});

  const { data: catalogData, isPending: catalogLoading, refetch: refetchCatalog } = useReadContract({
    address: FACTORY_ADDRESS,
    abi: FACTORY_ABI,
    functionName: 'getCatalog',
    query: {
      enabled: FACTORY_ADDRESS !== ZERO_ADDRESS,
    },
  });

  const tokens = useMemo<CatalogToken[]>(() => {
    if (!catalogData) return [];
    const [tokenEntries, saleSupply] = catalogData as unknown as [any[], bigint[]];
    return (tokenEntries || []).map((entry, idx) => ({
      token: entry.token as `0x${string}`,
      name: entry.name as string,
      symbol: entry.symbol as string,
      maxSupply: BigInt(entry.maxSupply ?? 0),
      pricePerToken: BigInt(entry.pricePerToken ?? 0),
      creator: entry.creator as string,
      saleSupply: saleSupply && saleSupply[idx] !== undefined ? BigInt(saleSupply[idx]) : 0n,
    }));
  }, [catalogData]);

  const balanceContracts = useMemo(() => {
    if (!address) return [];
    return tokens.map((token) => ({
      address: token.token,
      abi: TOKEN_ABI,
      functionName: 'confidentialBalanceOf' as const,
      args: [address],
    }));
  }, [tokens, address]);

  const {
    data: balanceData,
    isFetching: balancesLoading,
    refetch: refetchBalances,
  } = useReadContracts({
    contracts: balanceContracts,
    query: {
      enabled: balanceContracts.length > 0,
    },
  });

  const balanceHandles: BalanceHandle[] = useMemo(() => {
    if (!balanceData || !address) return [];
    return balanceData
      .map((entry, idx) => {
        if (!entry || entry.status !== 'success' || !entry.result) return null;
        const handle = entry.result as `0x${string}`;
        if (handle === ethers.ZeroHash) return null;
        return {
          address: tokens[idx]?.token ?? ZERO_ADDRESS,
          handle,
        };
      })
      .filter(Boolean) as BalanceHandle[];
  }, [balanceData, address, tokens]);

  const createToken = async (event: FormEvent) => {
    event.preventDefault();
    if (FACTORY_ADDRESS === ZERO_ADDRESS) {
      setStatusMessage('Set a deployed factory address to create tokens.');
      return;
    }

    try {
      setCreating(true);
      setStatusMessage('Preparing transaction...');

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Wallet not connected');
      }

      const name = formState.name.trim();
      const symbol = formState.symbol.trim();
      const supply = formState.supply.trim() ? BigInt(formState.supply) : DEFAULT_SUPPLY;
      const priceWei = ethers.parseEther(formState.price || '0');

      if (!name || !symbol) {
        throw new Error('Name and symbol are required');
      }
      if (priceWei <= 0n) {
        throw new Error('Price must be positive');
      }

      const factory = new Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);
      const tx = await factory.createToken(name, symbol, supply, priceWei);
      setStatusMessage(`Submitting createToken... ${tx.hash}`);
      await tx.wait();
      setStatusMessage('Token created on-chain.');
      setFormState({ name: '', symbol: '', supply: '', price: formState.price });
      await refetchCatalog();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create token';
      setStatusMessage(message);
      console.error(message);
    } finally {
      setCreating(false);
    }
  };

  const buyToken = async (token: CatalogToken) => {
    try {
      const amountInput = buyAmount[token.token] || '';
      const amount = BigInt(amountInput || '0');
      if (amount <= 0n) {
        setStatusMessage('Enter an amount greater than zero.');
        return;
      }

      const signer = await signerPromise;
      if (!signer) {
        setStatusMessage('Connect a wallet to buy tokens.');
        return;
      }

      const cost = token.pricePerToken * amount;
      const tokenContract = new Contract(token.token, TOKEN_ABI, signer);
      setBuying((prev) => ({ ...prev, [token.token]: true }));
      setStatusMessage(`Buying ${amount.toString()} ${token.symbol}...`);

      const tx = await tokenContract.buy(amount, { value: cost });
      await tx.wait();

      setStatusMessage('Purchase confirmed.');
      await Promise.all([refetchCatalog(), refetchBalances()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Purchase failed';
      setStatusMessage(message);
      console.error(message);
    } finally {
      setBuying((prev) => ({ ...prev, [token.token]: false }));
    }
  };

  const decryptBalance = async (token: CatalogToken, handle: `0x${string}`) => {
    if (!instance) {
      setStatusMessage('Encryption instance is not ready yet.');
      return;
    }
    if (!address) {
      setStatusMessage('Connect a wallet to decrypt balances.');
      return;
    }

    setDecrypting((prev) => ({ ...prev, [token.token]: true }));
    try {
      const keypair = instance.generateKeypair();
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '5';
      const contractAddresses = [token.token];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message
      );

      const result = await instance.userDecrypt(
        [{ handle, contractAddress: token.token }],
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays
      );

      const decrypted = result[handle] ?? '0';
      setDecryptedBalances((prev) => ({ ...prev, [token.token]: decrypted.toString() }));
      setStatusMessage(`Decrypted balance for ${token.symbol}: ${decrypted.toString()}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Decryption failed';
      setStatusMessage(message);
      console.error(message);
    } finally {
      setDecrypting((prev) => ({ ...prev, [token.token]: false }));
    }
  };

  const heroSubtitle =
    'Deploy ERC7984 tokens with Zama FHE, sell them for ETH, and decrypt balances only when you choose.';

  return (
    <div className="launchpad-shell">
      <header className="launchpad-header">
        <div>
          <p className="eyebrow">Confidential Token Studio</p>
          <h1>Mint private ERC7984 tokens and sell them instantly.</h1>
          <p className="lead">{heroSubtitle}</p>
          <div className="header-stats">
            <div>
              <span className="label">Tokens live</span>
              <strong>{tokens.length}</strong>
            </div>
            <div>
              <span className="label">Network</span>
              <strong>Sepolia</strong>
            </div>
          </div>
        </div>
        <div className="connect-box">
          <ConnectButton />
          <p className="connect-help">
            {FACTORY_ADDRESS === ZERO_ADDRESS
              ? 'Deploy the factory to Sepolia and set its address in the config to go live.'
              : 'Connected wallets can create tokens, buy them, and decrypt balances.'}
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="label">Create</p>
            <h2>Launch a new ERC7984 token</h2>
            <p className="muted">
              Provide a name, symbol, total supply (defaults to 1,000,000,000), and price per token in ETH.
            </p>
          </div>
        </div>
        <form className="form-grid" onSubmit={createToken}>
          <label className="form-item">
            <span>Name</span>
            <input
              value={formState.name}
              onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Confidential Dollar"
              required
            />
          </label>
          <label className="form-item">
            <span>Symbol</span>
            <input
              value={formState.symbol}
              onChange={(e) => setFormState((prev) => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
              placeholder="cUSD"
              required
            />
          </label>
          <label className="form-item">
            <span>Total supply</span>
            <input
              value={formState.supply}
              onChange={(e) => setFormState((prev) => ({ ...prev, supply: e.target.value }))}
              placeholder={DEFAULT_SUPPLY.toString()}
              type="number"
              min="1"
            />
            <small>Leave blank to mint 1,000,000,000 tokens for sale.</small>
          </label>
          <label className="form-item">
            <span>Price per token (ETH)</span>
            <input
              value={formState.price}
              onChange={(e) => setFormState((prev) => ({ ...prev, price: e.target.value }))}
              placeholder="0.001"
              type="number"
              min="0"
              step="0.0001"
              required
            />
            <small>Paid in ETH, tokens delivered as encrypted ERC7984 balances.</small>
          </label>
          <div className="form-actions">
            <button type="submit" disabled={creating || FACTORY_ADDRESS === ZERO_ADDRESS}>
              {creating ? 'Creating...' : 'Create token'}
            </button>
            {statusMessage && <p className="status-text">{statusMessage}</p>}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <p className="label">Tokens</p>
            <h2>Live confidential tokens</h2>
            <p className="muted">
              Buy with ETH and decrypt your balance when you need to reveal it. Reads use viem; writes use ethers.
            </p>
          </div>
          {(catalogLoading || balancesLoading) && <span className="pill">Updating...</span>}
        </div>

        {tokens.length === 0 ? (
          <div className="empty">No tokens yet. Create one to get started.</div>
        ) : (
          <div className="token-grid">
            {tokens.map((token) => {
              const amountInput = buyAmount[token.token] || '';
              const priceEth = ethers.formatEther(token.pricePerToken);
              const encryptedHandle = balanceHandles.find((item) => item.address === token.token)?.handle;
              const decrypted = decryptedBalances[token.token];

              return (
                <div className="token-card" key={token.token}>
                  <div className="token-meta">
                    <div>
                      <p className="label">Name</p>
                      <h3>{token.name}</h3>
                      <p className="muted">{token.symbol}</p>
                    </div>
                    <div className="pill">{token.creator.slice(0, 8)}...</div>
                  </div>

                  <div className="metrics">
                    <div>
                      <p className="label">Price</p>
                      <strong>{priceEth} ETH</strong>
                    </div>
                    <div>
                      <p className="label">For sale</p>
                      <strong>
                        {token.saleSupply.toString()} / {token.maxSupply.toString()}
                      </strong>
                    </div>
                  </div>

                  <div className="buy-row">
                    <label>
                      <span className="label">Amount</span>
                      <input
                        type="number"
                        min="1"
                        placeholder="50"
                        value={amountInput}
                        onChange={(e) => setBuyAmount((prev) => ({ ...prev, [token.token]: e.target.value }))}
                      />
                    </label>
                    <button
                      onClick={() => buyToken(token)}
                      disabled={!isConnected || buying[token.token] || FACTORY_ADDRESS === ZERO_ADDRESS}
                    >
                      {buying[token.token] ? 'Buying...' : 'Buy with ETH'}
                    </button>
                  </div>

                  <div className="balance-box">
                    <div>
                      <p className="label">Your encrypted balance</p>
                      <p className="muted">
                        {encryptedHandle
                          ? `${encryptedHandle.slice(0, 10)}...${encryptedHandle.slice(-6)}`
                          : 'No balance recorded'}
                      </p>
                    </div>
                    <div className="balance-actions">
                      <button
                        className="ghost"
                        onClick={() => encryptedHandle && decryptBalance(token, encryptedHandle)}
                        disabled={!encryptedHandle || decrypting[token.token] || zamaLoading}
                      >
                        {decrypting[token.token] ? 'Decrypting...' : 'Decrypt balance'}
                      </button>
                      {decrypted && <span className="pill success">{decrypted}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
