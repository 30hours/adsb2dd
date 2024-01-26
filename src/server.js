import express from 'express';
import fetch from 'node-fetch';
const app = express();
const port = 80;

app.use(express.static('public'));

app.get('/api/dd', async (req, res) => {

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

  // process data
  const isServerValid = await checkTar1090(apiUrl);
  if (isServerValid) {
    res.json({ server, rxLat, rxLon, rxAlt, txLat, txLon, txAlt, fc });
  } else {
    res.status(500).json({ error: 'Error checking tar1090 validity.' });
  }

});

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

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
