import _crypto from 'crypto';

const masterkey = "slkdfjs;ldkjxclvkjsd;lfkjsdflksjdf";

/**
 * Encrypts text by given key
 * @param String text to encrypt
 * @returns String encrypted text, base64 encoded
 */
export function encrypt(text) {
    if (!text) return null;
    
    const iv = _crypto.randomBytes(16);
    const salt = _crypto.randomBytes(64);

    // derive encryption key: 32 byte key length
    // in assumption the masterkey is a cryptographic and NOT a password there is no need for
    // a large number of iterations. It may can replaced by HKDF
    // the value of 2145 is randomly chosen!
    const key = _crypto.pbkdf2Sync(masterkey, salt, 2145, 32, 'sha512');

    // AES 256 GCM Mode
    const cipher = _crypto.createCipheriv('aes-256-gcm', key, iv);

    // encrypt the given text
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);

    // extract the auth tag
    const tag = cipher.getAuthTag();

    // generate output
    return Buffer.concat([salt, iv, tag, encrypted]).toString('base64');
}
