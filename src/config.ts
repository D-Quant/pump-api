// noinspection SpellCheckingInspection

import {Connection, Keypair} from '@solana/web3.js'
import bs58 from 'bs58'
import {PumpEngine} from "./engine";

const walletSecretKey = process.argv[2];
const rpcUrl = process.argv[3];

if (!walletSecretKey || !rpcUrl) {
    console.log(rpcUrl);
    throw new Error('Usage: ts-node src/index.ts <WALLET_SECRET_KEY> <ENDPOINT_URL>');
}
console.log(`walletSecretKey:${walletSecretKey}`);
console.log(`rpcUrl:${rpcUrl}`);
export const owner: Keypair = Keypair.fromSecretKey(bs58.decode(walletSecretKey))
export const connection = new Connection(rpcUrl) //<ENDPOINT_URL>
export const pumpEngine = new PumpEngine(rpcUrl, walletSecretKey)
const cluster = 'mainnet' // 'mainnet' | 'devnet'

