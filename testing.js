'use strict';

function take16(buffer) {
    let arr = [];
    for (var i = 0; i < 16; i++) {
        arr.push(buffer[i])
    }
    return arr;
}

const DfuMessage = require('./dfu_message');
const BLEMeshSerialInterface = require('./BLEMeshSerialInterface');

const toLittleEndian = a => a.slice(0).reverse()
const fromLittleEndian = toLittleEndian;
function bytesToNum(bytes) {
    let num = 0;
    let i = bytes.length - 1;
    for (let byte of bytes) {
        num += byte << (8 * i);
        i -= 1;
    }
    return num;
}

const MESH_ACCESS_ADDR = 0x8E89BED6;
const MESH_INTERVAL_MIN_MS = 100;
const MESH_CHANNEL = 38;

const showBuffer = buffer => '[' + buffer.map(n => parseInt(n).toString(16)).join(', ') + ']';

let FIRMWARE;
const fs = require('fs');
fs.readFile('./test-app.bin', (err, data) => {
    FIRMWARE = data;
});

const STATE = {
    WAIT_FOR_STARTED: 'WAIT_FOR_STARTED',
    WAIT_FOR_FWID: 'WAIT_FOR_FWID',
    SENT_FWID: 'SENT_FWID',
    WAIT_FOR_READY: 'WAIT_FOR_READY',
    SENT_READY: 'SENT_READY',
    SENT_START: 'SENT_START',
    SENT_DATA: 'SENT_DATA',
}

const mapTypeToSafeState = type => {
    // If we get data of this type, return a state that
    // is safe to reset to.
    switch (type) {
        case 'FWID':
            return STATE.WAIT_FOR_FWID
        case 'READY_APP':
        case 'READY_SD':
        case 'READY_BOOTLOADER':
            return STATE.WAIT_FOR_READY
        default:
            console.log(`called mapTypeToSafeState() on type ${type}`);
            process.exit(1);
    }
}

let currentState = STATE.WAIT_FOR_STARTED;

let SEGMENT = 1;
let transactionId;
const advStateCallback = (err, data) => {
    console.log('in callback: ' + showBuffer(data));
    if (err) {
        console.log(`ERR: ${err}`);
        return;
    }
    // Handle acks.
    if (data.length !== 2) {
        console.log('Not an ack?' + showBuffer(data));
        process.exit(1);
    }

    let state = currentState;
    const ack = bytesToNum(fromLittleEndian(data));
    // TODO: may want to check current state here,
    // so we dont skip everything by simply getting ie. data acks
    switch (ack) {
        case 0xfffe: // FWID
            state = STATE.WAIT_FOR_READY;
            break;
        case 0xfffd: // READY
            sendPacket('START_DFU', {
                transactionId,
                0: 0,
                startAddr: 0xffffffff,
                length: FIRMWARE.length / 4,
                signLength: 0,
                flags: 12,
            });
            state = STATE.SENT_START;
            break;
        case 0xfffc: // START/DATA
            if (SEGMENT <= (FIRMWARE.length/16) + 1) {
                const fwSlice = FIRMWARE.slice(16 * (SEGMENT - 1), 16 * SEGMENT)
                if (SEGMENT == 1)
                    sendPacket('DFU_DATA', {
                        segment: SEGMENT,
                        transactionId,
                        dataSegment: toLittleEndian(take16(fwSlice)),
                    });
                SEGMENT++;
            }
            state = STATE.SENT_DATA;
            break;
        case 0xfffb: // DATA REQ
            console.log('Unhandled ack 0xfffb');
            process.exit(1);
            break;
        case 0xfffa: // DATA RSP
            console.log('Unhandled ack 0xfffa');
            process.exit(1);
            break;
        default:
            console.log(`unknown ack: ${showBuffer(data)} (${ack.toString(16)})`);
    }

    // TODO: get the global out of here, somehow?
    console.log(`\n\t${currentState}->${state} [CB]\n`);
    currentState = state;
}

let mesh;

function sendPacket(type, packet, cb) {
    const bytes = DfuMessage.messageTypeToBytes(type, packet);
    const obj = DfuMessage.inferFromBytes(bytes);

    // DEBUG
    console.log('###### send this #####')
    console.log(showBuffer(bytes));
    console.log(`${obj[0]}`);
    console.log(obj[1]);
    console.log('######################')
    // DEBUG END

    if (cb) {
        mesh.dfuData(bytes, (err, val) => {
            advStateCallback(err, val);
            cb();
        })
    } else {
        mesh.dfuData(bytes, advStateCallback);
    }
}

function advanceState(state, rawData) {
    // (oldState, dfu data) -> new state.
    // Similar to a reducer in React.

    // TODO: add error checking
    const bytes = rawData.slice(2);
    const _data = DfuMessage.inferFromBytes(bytes);
    // I wish we had array destructuring :(
    const type = _data[0];
    const data = _data[1];

    switch (state) {
        case STATE.WAIT_FOR_STARTED:
        case STATE.WAIT_FOR_FWID:
            if (type === 'FWID') {
                sendPacket('FWID', {
                    sdVersion:  0x64,
                    blType:     0x1,
                    blVersion:  0x1,
                    companyId:  0x59,
                    appId:      0xbeef,
                    appVersion: 0x2,
                });
                return STATE.SENT_FWID;
            }
            break;
        // We don't really need the ack, i guess?
        case STATE.SENT_FWID:
        case STATE.WAIT_FOR_READY:
            if (type === 'READY_APP') {
                if (data.transactionId === 0) {
                    transactionId = Math.random() * (1 << 30);
                    sendPacket('READY_APP', {
                        transactionId,
                        authority: 7,
                        companyId: 0x59,
                        appId: 0xbeef,
                        appVersion: 0x2,
                    });
                    return STATE.SENT_READY;
                } else if (data.transactionId === 7) {
                    // This is the ack for READY_APP, somehow
                    sendPacket('START_DFU', {
                        transactionId,
                        0: 0,
                        startAddr: 0x18000,
                        length: 0x10,
                        signLength: 0,
                        flags: 0,
                    });
                    return STATE.SENT_START;
                }
            } else {
                return advanceState(mapTypeToSafeState(type), rawData);
            }
            break;
        case STATE.SENT_READY:
        case STATE.SENT_START:
            return advanceState(mapTypeToSafeState(type), rawData);
            console.log('Should not come here');
            console.log(state);
            console.log(type);
            console.log(data);
            process.exit(1);
            break;
        case STATE.SENT_DATA:
            if (type === 'FWID') {
                if (data.appVersion === 0x2) {
                    console.log('\n~~~~~~~~~~suceess!~~~~~~~~~~\n');
                    process.exit(1);
                } else if (data.appVersion === 0x1) {
                    console.log('\n~~~~~~~~~~restart?~~~~~~~~~~\n');
                    return advanceState(STATE.WAIT_FOR_FWID, rawData);
                }
            }
        default:
            console.log(`unhandled state: ${state}`);
            process.exit(1);
    }
    console.log(`Not sure what to do in state ${state} with data: ${showBuffer(rawData)}`);
    process.exit(1);
}

function run(com) {
    let print = msg => console.log(`[${com}]:`, msg);
    mesh = new BLEMeshSerialInterface(com, err => {
        mesh.radioReset(() => {});
        mesh.on('deviceStarted', val => {
            console.log('This should be first')
            // currentState = advanceState(currentState, val);
        })
        mesh.on('eventDFU', raw_data => {
            // DEBUG
            console.log('====== got this ======')
            console.log(showBuffer(raw_data))
            const asd = DfuMessage.inferFromBytes(raw_data.slice(2));
            console.log(asd[0])
            console.log(asd[1])
            console.log('======================')
            // DEBUG END

            const newState = advanceState(currentState, raw_data);

            // DEBUG
            if (newState === undefined) {
                console.log('### advnceState returned undefined.')
                process.exit(1);
            }
            console.log(`\n\t${currentState} -> ${newState}\n`);

            // DEBUG END
            currentState = newState;
            return;
        });
    });
}

run('COM12')
// run('COM10')
// run('COM11')
