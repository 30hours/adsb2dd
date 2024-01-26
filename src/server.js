import express from 'express';
import fetch from 'node-fetch';

import {checkTar1090, getTar1090} from './node/tar1090.js';
import {lla2ecef, norm} from './node/geometry.js';

const app = express();
const port = 80;

// constants
var dict = {};
const tUpdate = 1000;
const nApiMax = 10;
const tDelete = 600;

app.use(express.static('public'));

app.get('/api/dd', async (req, res) => {

  if (req.originalUrl in dict) {
    return res.json(dict[req.originalUrl]['out']);
  }

  // limit number of active requests
  if (Object.keys(dict).length > nApiMax) {
    return res.status(400).json({ error: 'Exceeded max API requests.' });
  }
    
  // extract and validate parameters
  const server = req.query.server;
  const rxParams = req.query.rx.split(',').map(parseFloat);
  const txParams = req.query.tx.split(',').map(parseFloat);
  const fc = parseFloat(req.query.fc);
  if (!server || !rxParams.every(isValidNumber) || !txParams.every(isValidNumber) || isNaN(fc)) {
    return res.status(400).json({ error: 'Invalid parameters.' });
  }
  const [rxLat, rxLon, rxAlt] = rxParams;
  const [txLat, txLon, txAlt] = txParams;
  const apiUrl = server + '/data/aircraft.json';

  // add new entry to dict
  const isServerValid = await checkTar1090(apiUrl);
  if (isServerValid) {
    dict[req.originalUrl] = {};
    dict[req.originalUrl]['rxLat'] = rxLat;
    dict[req.originalUrl]['rxLon'] = rxLon;
    dict[req.originalUrl]['rxAlt'] = rxAlt;
    dict[req.originalUrl]['txLat'] = txLat;
    dict[req.originalUrl]['txLon'] = txLon;
    dict[req.originalUrl]['txAlt'] = txAlt;
    dict[req.originalUrl]['fc'] = fc;
    dict[req.originalUrl]['server'] = server;
    dict[req.originalUrl]['apiUrl'] = apiUrl;
    dict[req.originalUrl]['out'] = {};
    const ecefRx = lla2ecef(rxLat, rxLon, rxAlt);
    const ecefTx = lla2ecef(txLat, txLon, txAlt);
    dict[req.originalUrl]['ecefRx'] = ecefRx;
    dict[req.originalUrl]['ecefTx'] = ecefTx;
    dict[req.originalUrl]['dRxTx'] = norm([ecefRx.x - ecefTx.x, 
      ecefRx.y - ecefTx.y, ecefRx.z - ecefTx.z]);
    return res.json(dict[req.originalUrl]['out']);
  } else {
    return res.status(500).json({ error: 'Error checking tar1090 validity.' });
  }

});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});

/// @brief Main event loop to update dict data.
/// @details Loops over each request URL and updates dict data.
/// This means multiple geometries/frequencies/servers can be used simultaneously.
/// Removes dict entry if API not called for some time.
/// Recursive setTimeout call ensures no function overlapping.
/// @return Void.
const process = async () => {
  
  // loop over dict entries
  for (const [key, value] of Object.entries(dict)) {

    // get latest JSON from server
    var json = await getTar1090(dict[key]['apiUrl']);

    // check that ADS-B data has updated
    if (json.now === dict[key]['out']['timestamp']) {
      continue;
    }

    // core processing
    adsb2dd(key, json);

    // remove key after inactivity
    if (Date.now()/1000-dict[key]['out']['timestamp'] > tDelete) {
      delete(dict[key]);
    }

  }

  setTimeout(process, tUpdate);
};
setTimeout(process, tUpdate);


/// @brief Convert ADS-B coordinates to delay-Doppler coordinates.
/// @details Implements core functionality of this program.
/// Compute bistatic delay and Doppler using rx/tx locations.
/// Apply coefficient to convert m/s to Hz.
/// @param key Current key in dict (API endpoint).
/// @param json Current JSON from tar1090 server.
function adsb2dd(key, json) {

  dict[key]['out']['timestamp'] = json.now;

  // loop over aircraft from JSON
  for (const aircraft of json.aircraft) {

    // only consider aircraft with lat/lon/alt
    if (isValidNumber(aircraft['lat']) && isValidNumber(aircraft['lon']) && isValidNumber(aircraft['alt_geom'])) {
      
      const hexCode = aircraft.hex;
      dict[key]['out'][hexCode] = {};
      dict[key]['out'][hexCode]['timestamp'] = json.now;
      dict[key]['out'][hexCode]['flight'] = aircraft.flight;

      // bistatic delay (km)
      

    }

  }
  
}

/// @brief Helper to check if a value is a valid number.
/// @param value Value to check.
/// @return True is value is valid.
function isValidNumber(value) {
  return !isNaN(value);
}

