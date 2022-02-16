const _crypto = require('crypto');

const masterkey = "slkdfjs;ldkjxclvkjsd;lfkjsdflksjdf";

/**
 * Encrypts text by given key
 * @param String text to encrypt
 * @returns String encrypted text, base64 encoded
 */
function encrypt(text) {
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


/**
 * Decrypts text by given key
 * @param String base64 encoded input data
 * @param Buffer masterkey
 * @returns String decrypted (original) text
 */
function decrypt(encdata) {
    if (!encdata) return null;
    // base64 decoding
    const bData = Buffer.from(encdata, 'base64');

    // convert data to buffers
    const salt = bData.slice(0, 64);
    const iv = bData.slice(64, 80);
    const tag = bData.slice(80, 96);
    const text = bData.slice(96);

    // derive key using; 32 byte key length
    const key = _crypto.pbkdf2Sync(masterkey, salt, 2145, 32, 'sha512');

    // AES 256 GCM Mode
    const decipher = _crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    // encrypt the given text
    const decrypted = decipher.update(text, 'binary', 'utf8') + decipher.final('utf8');

    return decrypted;
}

module.exports = { encrypt, decrypt };
