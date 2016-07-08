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
    'DFU_DATA': [
        'handle',
        'segment',
        'transactionId',
        'dataSegment',
    ]

}

const fieldLength = {
        '0': 2,
        'appId': 2,
        'appVersion': 4,
        'authority': 1,
        'blType': 1,
        'blVersion': 1,
        'companyId': 4,
        'dataSegment': 16,
        'flags': 1,
        'handle': 2,
        'length': 4,
        'sdVersion': 2,
        'segment': 2,
        'signLength': 2,
        'startAddr': 4,
        'transactionId': 4,
        'type': 1,
};

const typeToHandle = type => {
    switch (type) {
        case 'FWID':
            return 0xfffe
        case 'READY_APP':
        case 'READY_SD':
        case 'READY_BOOTLOADER':
            return 0xfffd
        case 'START_DFU':
        case 'DFU_DATA':
            return 0xfffc
        case 'DFU_DATA_REQ':
            return 0xfffb
        case 'DFU_DATA_RSP':
            return 0xfffa
        case 'RELAY_REQUEST':
            return 0xfff9
        default: 
            console.log(`[ERR]: unknown type: ${type}`);
            return 0;
    }
}

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
    if (obj['handle'] === undefined) {
        obj['handle'] = typeToHandle(msgtype);
    }
    // Check misspellings of fields in obj
    for (let key of Object.keys(obj)) {
        if (fields[msgtype].indexOf(key) === -1) {
            console.log(`[WARN] did you misspell field ${key} of msgtype ${msgtype}?`)
        }
    }
    const bytes = [];
    for (let field of fields[msgtype]) {
        let fieldBytes;
        if (Array.prototype.isPrototypeOf(obj[field])) {
            // If we've already passed raw bytes, do nothing.
            // NOTE: assume little endian conversion is already done,
            // so that the array is sent as-is.
            fieldBytes = obj[field];
        } else {
            // Convert the number to bytes.
            fieldBytes = toLittleEndian(numToBytes(obj[field]))
            if (fieldBytes === undefined) {
                console.log(`fieldBytes was undefined. field=${field}`);
                let asd = 12/0;
            }
            if (fieldBytes.length > fieldLength[field]) {
                console.log(`Number in field ${field} too large: ${obj[field]}. Max is ${maxNumInBytes(fieldLength[field])}`);
                return undefined;
            }
        }
        // Make sure the length is correct
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

function inferFromBytes(bytes) {
    // Take bytes, and try to figure out what kind of message type it is,
    // as well as decode it to its proper object. Return both.
    let handle = bytesToNum(fromLittleEndian(bytes.slice(0, fieldLength['handle'])));

    let msgtype;
    let obj;
    switch (handle) {
        case 0xfffe:
            msgtype = 'FWID';
            obj = bytesToMessageType('FWID', bytes);
            break;
        case 0xfffd:
            // TOOD: may be something else
            msgtype = 'READY_APP';
            obj = bytesToMessageType('READY_APP', bytes);
            break;
        case 0xfffc:
            msgtype = bytesToNum(bytes.slice(2, 4)) === 0 ? 'START_DFU' : 'DFU_DATA';
            obj = bytesToMessageType(msgtype, bytes);
            break;
        default: {
            console.log(`unknown handle: ${handle}`);
            break;
        }
    }
    return [msgtype, obj];
}

module.exports = {
    bytesToMessageType,
    messageTypeToBytes,
    inferFromBytes,
}
