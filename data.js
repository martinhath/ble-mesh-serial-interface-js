'use strict'

const toLittleEndian = a => a.slice(0).reverse()
const fromLittleEndian = toLittleEndian;

const maxNumInBytes = n => (1 << (n * 8)) - 1

function numToBytes(num) {
    const bytes = [];
    while (num > 0) {
        bytes.push(num & 0xff);
        num >>= 8;
    }
    return bytes.reverse()
}

function bytesToNum(bytes) {
    let num = 0;
    let i = bytes.length - 1;
    for (let byte of bytes) {
        num += byte << (8 * i);
        i -= 1;
    }
    return num;
}

const fields = {
    'FWID': [
        'handle',
        'sdVersion',
        'blType',
        'blVersion',
        'companyId',
        'appId',
        'appVersion',
    ],
    'READY_APP': [
        'handle',
        'type',
        'authority',
        'transactionId',
        'companyId',
        'appId',
        'appVersion',
    ],
    'READY_SD': [
        // TODO
    ],
    'READY_BOOTLOADER': [
        // TODO
    ],
    'START_DFU': [
        'handle',
        '0',
        'transactionId',
        'startAddr',
        'length',
        'signLength',
        'flags'
    ],

}
const fieldLength = {
    'handle': 2,
    'sdVersion': 2,
    'blType': 1,
    'blVersion': 1,  
    'companyId': 4,
    'appId': 2,
    'appVersion': 4,
};

function bytesToMessageType(msgtype, arr) {
    // Transform a byte sequence to an object of a given message type.
    if (fields[msgtype] === undefined) {
        console.log(`unknown message type: ${msgtype}`);
        return;
    }
    let obj = {};
    let i = 0;
    for (let field of fields[msgtype]) {
        let data = arr.slice(i, i + fieldLength[field]);
        obj[field] = bytesToNum(fromLittleEndian(data));
        i += fieldLength[field];
    }
    return obj;
}

function messageTypeToBytes(msgtype, obj) {
    // Map a object for a given message type to its byte representation
    if (fields[msgtype] === undefined) {
        console.log(`unknown message type: ${msgtype}`);
        return;
    }
    const bytes = [];
    for (let field of fields[msgtype]) {
        let fieldBytes = toLittleEndian(numToBytes(obj[field]))
        if (fieldBytes.length > fieldLength[field]) {
            console.log(`Number in field ${field} too large: ${obj[field]}. Max is ${maxNumInBytes(fieldLength[field])}`);
            return undefined;
        }
        // Pad with zeroes
        if (fieldBytes.length < fieldLength[field]) {
            let diff = fieldLength[field] - fieldBytes.length;
            while (diff --> 0) {
                fieldBytes.push(0);
            }
        }
        for (let byte of fieldBytes) {
            bytes.push(byte)
        }
    }
    return bytes
}

module.exports = {
    bytesToMessageType,
    messageTypeToBytes,
}
