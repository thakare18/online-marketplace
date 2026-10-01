const crypto = require('crypto');

function parse(uuid) {
    if (Buffer.isBuffer(uuid)) return uuid;
    if (Array.isArray(uuid)) return Buffer.from(uuid);
    return Buffer.from(String(uuid).replace(/-/g, ''), 'hex');
}

function stringify(buf) {
    const hex = Buffer.from(buf).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function v4() {
    return crypto.randomUUID();
}

function v6() {
    return crypto.randomUUID();
}

function v1() {
    return crypto.randomUUID();
}

function validate(uuid) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

function v5(name, namespace) {
    const hash = crypto.createHash('sha1');
    if (namespace) {
        hash.update(parse(namespace));
    }
    hash.update(Buffer.from(String(name)));
    const buf = hash.digest();
    buf[6] = (buf[6] & 0x0f) | 0x50; // version 5
    buf[8] = (buf[8] & 0x3f) | 0x80; // variant
    return stringify(buf.slice(0, 16));
}

function v3(name, namespace) {
    const hash = crypto.createHash('md5');
    if (namespace) {
        hash.update(parse(namespace));
    }
    hash.update(Buffer.from(String(name)));
    const buf = hash.digest();
    buf[6] = (buf[6] & 0x0f) | 0x30;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    return stringify(buf.slice(0, 16));
}

module.exports = {
    v1,
    v3,
    v4,
    v5,
    v6,
    parse,
    stringify,
    validate,
    NIL: '00000000-0000-0000-0000-000000000000'
};
