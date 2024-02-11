import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

import {checkTar1090, getTar1090} from './node/tar1090.js';
import {lla2ecef, norm, ft2m} from './node/geometry.js';
import {isValidNumber} from './node/validate.js';

const app = express();
app.use(cors());
const port = 80;

// constants
var dict = {};
const tUpdate = 1000;
const nApiMax = 10;
const tDelete = 600;
const tDeletePlane = 5;
const nMaxDelayArray = 10;
const nDopplerSmooth = 10;

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
    dict[req.originalUrl]['proc'] = {};
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

  // remove aircraft if no recent updates
  for (const aircraft in dict[key]['out']) {
    if (Date.now()/1000 - dict[key]['out'][aircraft]['timestamp'] > tDeletePlane) {
      delete(dict[key]['out'][aircraft]);
      delete(dict[key]['proc'][aircraft]);
    }
  }

  // loop over aircraft from JSON
  for (const aircraft of json.aircraft) {

    // only consider aircraft with lat/lon/alt/flight
    if (isValidNumber(aircraft['lat']) && isValidNumber(aircraft['lon']) && 
      isValidNumber(aircraft['alt_geom'] && (aircraft['flight'] != undefined))) {

      // add new entry
      const hexCode = aircraft.hex;
      if (!(hexCode in dict[key]['out'])) {
        dict[key]['out'][hexCode] = {};
        dict[key]['proc'][hexCode] = {};
        dict[key]['proc'][hexCode]['delays'] = [];
        dict[key]['proc'][hexCode]['timestamps'] = [];
      }

      // skip if no change to lat/lon/alt
      if (dict[key]['out'][hexCode]['lat'] === aircraft['lat'] &&
        dict[key]['out'][hexCode]['lon'] === aircraft['lon'] &&
        dict[key]['out'][hexCode]['alt'] === aircraft['alt_geom']) {
        continue;
      }

      dict[key]['out'][hexCode]['timestamp'] = json.now + aircraft.seen_pos;
      dict[key]['out'][hexCode]['flight'] = (aircraft.flight);
      dict[key]['proc'][hexCode]['lat'] = aircraft['lat'];
      dict[key]['proc'][hexCode]['lon'] = aircraft['lon'];
      dict[key]['proc'][hexCode]['alt'] = aircraft['alt_geom'];

      // convert target to ECEF
      const tar = lla2ecef(aircraft['lat'], aircraft['lon'], ft2m(aircraft['alt_geom']));

      // bistatic delay (km)
      const dRxTar = norm([dict[key]['ecefRx'].x-tar.x,
        dict[key]['ecefRx'].y-tar.y,
	dict[key]['ecefRx'].z-tar.z]);
      const dTxTar = norm([dict[key]['ecefTx'].x-tar.x,
        dict[key]['ecefTx'].y-tar.y,
	dict[key]['ecefTx'].z-tar.z]);
      const delay = dRxTar + dTxTar - dict[key]['dRxTx'];

      // store bistatic delay/timestamps for Doppler
      dict[key]['proc'][hexCode]['delays'].push(delay);
      dict[key]['proc'][hexCode]['timestamps'].push(json.now + aircraft.seen_pos);

      // bistatic Doppler (Hz)
      if (dict[key]['proc'][hexCode]['delays'].length >= 2) {

	// smoothed derivative using median method
	const doppler_ms_arr = smoothedDerivativeUsingMedian(
	  dict[key]['proc'][hexCode]['delays'], 
	  dict[key]['proc'][hexCode]['timestamps'], nDopplerSmooth);
	const doppler_ms = doppler_ms_arr.at(-1);

	// standard derivative (noisy)
	/*
	const delta_t = dict[key]['proc'][hexCode]['timestamps'].at(-1)
          - dict[key]['proc'][hexCode]['timestamps'].at(-2);
	const diff = dict[key]['proc'][hexCode]['delays'].at(-1)
	  - dict[key]['proc'][hexCode]['delays'].at(-2);
        const doppler_ms = diff / delta_t;
	*/

	// convert Doppler to Hz
        const doppler = -doppler_ms/(1*(299792458/(dict[key]['fc']*1000000)));

	// output data
	dict[key]['out'][hexCode]['delay'] = limit_digits(delay/1000, 5)
        dict[key]['out'][hexCode]['doppler'] = limit_digits(doppler, 5)

	// limit max number of storage
        if (dict[key]['proc'][hexCode]['delays'].length >= nMaxDelayArray) {
	  dict[key]['proc'][hexCode]['delays'].shift();
	  dict[key]['proc'][hexCode]['timestamps'].shift();
	}
      }

    }

  }
  
}


function limit_digits(number, digits) {
  if (Number.isInteger(number)) {
    return number;
  } else {
    return number.toFixed(digits);
  }
}

/// @brief Computes a smoothed derivative of delays with respect to timestamps. 
/// @details Using a moving median method on the last k samples. 
/// If fewer than k samples are given for delays and timestamps, it will use all available samples.
/// Just a hunch and probably not optimum.
/// @param delays Array to diff.
/// @param timestamps Array to diff with respect to.
/// @param k Maximum number of samples to compute median on.
/// @return Array containing a smoothed derivative.
function smoothedDerivativeUsingMedian(delays, timestamps, k) {
  if (delays.length !== timestamps.length || delays.length < 2 || k < 2) {
    throw new Error('Invalid input data for computing the derivative.');
  }

  const result = [];

  for (let i = 0; i < delays.length; i++) {
    const startIdx = Math.max(0, i - k + 1);
    const endIdx = i + 1;

    const lastKDelays = delays.slice(startIdx, endIdx);
    const lastKTimestamps = timestamps.slice(startIdx, endIdx);

    const deltaDelays = lastKDelays.map((delay, idx) => {
      if (idx > 0) {
        const deltaTime = lastKTimestamps[idx] - lastKTimestamps[idx - 1];
        return (delay - lastKDelays[idx - 1]) / deltaTime;
      }
      return 0; // If it's the first element, set the derivative to 0.
    });

    // calculate the moving median of the delta delays
    const movingMedianDerivative = calculateMovingMedian(deltaDelays);

    result.push(movingMedianDerivative);
  }

  return result;
}

/// @brief Helper function to calculate the moving median of an array
/// @param arr Array to calculate moving median on.
/// @return Array of moving median.
function calculateMovingMedian(arr) {
  const sortedArr = [...arr].sort((a, b) => a - b);
  const middle = Math.floor(sortedArr.length / 2);

  if (sortedArr.length % 2 === 0) {
    return (sortedArr[middle - 1] + sortedArr[middle]) / 2;
  } else {
    return sortedArr[middle];
  }
}
