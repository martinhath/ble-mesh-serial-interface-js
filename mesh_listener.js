'use strict';

const BLEMeshSerialInterface = require('./index');

const MESH_ACCESS_ADDR = 0x8E89BED6;
const MESH_INTERVAL_MIN_MS = 100;
const MESH_CHANNEL = 38;

const COM_PORT = 'COM45';

function check_err(err) {
  if (err) {
      console.log(err);
  }
}

const bleMeshSerialInterfaceAPI = new BLEMeshSerialInterface(COM_PORT, err => {

  bleMeshSerialInterfaceAPI.on('deviceStarted', data => {
    console.log('device started, response: ', data);
  });

  bleMeshSerialInterfaceAPI.on('eventNew', data => {
    console.log(`eventNew, handle: ${data.slice(0, 2).toString('hex')}, data: ${data.slice(2).toString()}.`);
  });

  bleMeshSerialInterfaceAPI.on('eventUpdate', data => {
    console.log(`eventUpdate, handle: ${data.slice(0, 2).toString('hex')}, data: ${data.slice(2).toString()}.`);
  });

  bleMeshSerialInterfaceAPI.on('eventConflicting', data => {
    console.log(`eventConflicting, handle: ${data.slice(0, 2).toString('hex')}, data: ${data.slice(2).toString()}.`);
  });

  bleMeshSerialInterfaceAPI.on('eventTX', data => {
    console.log(`eventTX, response: ${data.slice(2).toString('hex')}.`);
  });

  bleMeshSerialInterfaceAPI.init(MESH_ACCESS_ADDR, MESH_INTERVAL_MIN_MS, MESH_CHANNEL, err => {
    check_err(err)
    console.log('device initialized, listening to the mesh...');
    bleMeshSerialInterfaceAPI.dfuData(new Buffer(new Array(23).fill(0xff)), (err, res) => {
      check_err(err)
      console.log('dfuData...');
    });
    /*bleMeshSerialInterfaceAPI.valueSet(10, new Buffer([0x00, 0x01, 0x02]), err => {
      check_err(err)
      console.log('valueSet()');
      bleMeshSerialInterfaceAPI.valueGet(10, (err, res) => {
        check_err(err)
        console.log('valueGet()');
        bleMeshSerialInterfaceAPI.radioReset(err => {
          check_err(err)
          console.log('device reset');
        });
      });
    });*/
  });
});