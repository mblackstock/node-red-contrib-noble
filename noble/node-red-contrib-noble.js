/*
 * Copyright (c) 2014. Knowledge Media Institute - The Open University
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * NodeRed node with support for interaction with BLEs
 *
 * @author <a href="mailto:carlos.pedrinaci@open.ac.uk">Carlos Pedrinaci</a> (KMi - The Open University)
 * based on the initial node by Charalampos Doukas http://blog.buildinginternetofthings.com/2013/10/12/using-node-red-to-scan-for-ble-devices/
 */

module.exports = function(RED) {

    "use strict";
    var noble = require('noble');
    var os = require('os');
    
    // The main node definition - most things happen in here
    function NobleScan(n) {
        // Create a RED node
        RED.nodes.createNode(this,n);

        // Store local copies of the node configuration (as defined in the .html)
        this.duplicates = n.duplicates;
        this.uuids = [];
        if (n.uuids != undefined && n.uuids !== "") {
            this.uuids = n.uuids.split(',');    //obtain array of uuids
        }

        var node = this;
        var machineId = os.hostname();
        var scanning = false;

        noble.on('discover', function(peripheral) {
            var msg = { payload:{peripheralUuid:peripheral.uuid, localName: peripheral.advertisement.localName} };
            msg.peripheralUuid = peripheral.uuid;
            msg.localName = peripheral.advertisement.localName;
            msg.detectedAt = new Date().getTime();
            msg.detectedBy = machineId;
            msg.advertisement = peripheral.advertisement;
            msg.rssi = peripheral.rssi;

            // Check the BLE follows iBeacon spec
            if (peripheral.manufacturerData) {
                // http://www.theregister.co.uk/2013/11/29/feature_diy_apple_ibeacons/
                if (peripheral.manufacturerData.length >= 25) {
                    var proxUuid = peripheral.manufacturerData.slice(4, 20).toString('hex');
                    var major = peripheral.manufacturerData.readUInt16BE(20);
                    var minor = peripheral.manufacturerData.readUInt16BE(22);
                    var measuredPower = peripheral.manufacturerData.readInt8(24);

                    var accuracy = Math.pow(12.0, 1.5 * ((rssi / measuredPower) - 1));
                    var proximity = null;

                    if (accuracy < 0) {
                        proximity = 'unknown';
                    } else if (accuracy < 0.5) {
                        proximity = 'immediate';
                    } else if (accuracy < 4.0) {
                        proximity = 'near';
                    } else {
                        proximity = 'far';
                    }

                    msg.manufacturerUuid = proxUuid;
                    msg.major = major;
                    msg.minor = minor;
                    msg.measuredPower = measuredPower;
                    msg.accuracy = accuracy;
                    msg.proximity = proximity;
                }
            }

            // Generate output event
            node.send(msg);
        });

        // Take care of starting the scan and sending the status message
        function startScan(stateChange, error) {
            if (!node.scanning) {
                // send status message
                var msg = {
                    statusUpdate: true,
                    error: error,
                    stateChange: stateChange,
                    state: noble.state
                };
                node.send(msg);
                // start the scan
                noble.startScanning(node.uuids, node.duplicates, function() {
                    node.log("Scanning for BLEs started. UUIDs: " + node.uuids + " - Duplicates allowed: " + node.duplicates);
                    node.status({fill:"green",shape:"dot",text:"started"});
                    node.scanning = true;
                });
            }
        }

        // Take care of stopping the scan and sending the status message
        function stopScan(stateChange, error) {
            if (node.scanning) {
                // send status message
                var msg = {
                    statusUpdate: true,
                    error: error,
                    stateChange: stateChange,
                    state: noble.state
                };
                node.send(msg);
                // start the scan
                noble.stopScanning(function() {
                    node.log('BLE scanning stopped.');
                    node.status({fill:"red",shape:"ring",text:"stopped"});
                    node.scanning = false;
                });
                if (error) {
                    node.warn('BLE scanning stopped due to change in adapter state.');
                }
            }
        }

        // deal with state changes
        noble.on('stateChange', function(state) {
            if (state === 'poweredOn') {
                startScan(true, false);
            } else {
                if (node.scanning) {
                    stopScan(true, true);
                }
            }
        });

        // start initially
        if (noble.state === 'poweredOn') {
            startScan(false, false);
        } else {
            // send status message
            var msg = {
                statusUpdate: true,
                error: true,
                stateChange: false,
                state: noble.state
            };

            // TODO: Catch a global event instead eventually
            setTimeout(function(){
                node.send(msg);
            }, 3000);

            node.warn('Unable to start BLE scan. Adapter state: ' + noble.state);
        }

        // control scanning
        this.on('input', function (msg) {
            if (msg.scan && msg.scan === true) {
                startScan(false, false);
            } else if (msg.scan === false) {
                stopScan(false, false);
            }
        });
    
        this.on("close", function() {
            // Called when the node is shutdown - eg on redeploy.
            // Allows ports to be closed, connections dropped etc.
            // eg: this.client.disconnect();
            stopScan(false, false);
            // remove listeners since they get added again on deploy
            noble.removeAllListeners();
        });
    }
    
    // Register the node by name. This must be called before overriding any of the
    // Node functions.
    RED.nodes.registerType("scan ble",NobleScan);

}
