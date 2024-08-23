import {Keypair} from '@solana/web3.js';
import bs58 from 'bs58';
import {mnemonicToSeedSync} from 'bip39';
import {derivePath} from 'ed25519-hd-key';

export function genKeyPair(secret_key: string): Keypair {
    // most likely someone pasted the private key in binary format
    if (secret_key.startsWith('[')) {
        const raw = new Uint8Array(JSON.parse(secret_key))
        return Keypair.fromSecretKey(raw);
    }

    // most likely someone pasted mnemonic
    if (secret_key.split(' ').length > 1) {
        const seed = mnemonicToSeedSync(secret_key, '');
        const path = `m/44'/501'/0'/0'`; // we assume it's first path
        return Keypair.fromSeed(derivePath(path, seed.toString('hex')).key);
    }

    // most likely someone pasted base58 encoded private key
    return Keypair.fromSecretKey(bs58.decode(secret_key));
}
