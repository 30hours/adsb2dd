import express from 'express';
import fetch from 'node-fetch';
const app = express();
const port = 80;

// constants
var dict = {};
const tUpdate = 1000;
const nApiMax = 10;

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
    dict[req.originalUrl]['out'] = {};
    return res.json(dict[req.originalUrl]['out']);
  } else {
    return res.status(500).json({ error: 'Error checking tar1090 validity.' });
  }

});

/// @brief Convert ADS-B coordinates to delay-Doppler coordinates.
/// @details Loops over each request URL and updates dict data.
/// This means multiple geometries/frequencies/servers can be used simultaneously.
/// Removes dict entry if API not called for some time.
/// Recursive setTimeout call ensures no function overlapping.
/// @return Void.
const process = () => {
  
  // loop over dict entries
  for (const [key, value] of Object.entries(dict)) {
    dict[key]['out']['timestamp'] = Date.now();
  }

  setTimeout(process, tUpdate);
};
setTimeout(process, tUpdate);

/// @brief Helper to check if a value is a valid number.
/// @param value Value to check.
/// @return True is value is valid.
function isValidNumber(value) {
  return !isNaN(value);
}

/// @brief Check that the tar1090 server is valid and active.
/// @param apiUrl Full path to aircraft.json.
/// @return True if tar1090 server is valid.
async function checkTar1090(apiUrl) {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch data. Status: ${response.status}`);
    }

    const data = await response.json();
    if (data && typeof data.now === 'number' && !isNaN(data.now)) {
      return true;
    } else {
      console.log('Invalid or missing timestamp in the "now" key.');
      return false;
    }
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

/// @brief Get JSON response from tar1090 server.
/// @param apiUrl Full path to aircraft.json.
/// @return JSON response.
async function getTar1090(apiUrl) {
  try {
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch data. Status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error.message);
    return false;
  }
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
