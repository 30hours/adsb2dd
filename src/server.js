const express = require('express');
const app = express();
const port = 80;

app.use(express.static('public'));

app.get('/api/dd', (req, res) => {

  // extract and split query parameters
  const server = req.query.server;
  const rxParams = req.query.rx.split(',').map(parseFloat);
  const txParams = req.query.tx.split(',').map(parseFloat);
  const fc = parseFloat(req.query.fc);

  // validate parameters
  if (!server || !rxParams.every(isValidNumber) || !txParams.every(isValidNumber) || isNaN(fc)) {
    return res.status(400).json({ error: 'Invalid parameters.' });
  }

  const [rxLat, rxLon, rxAlt] = rxParams;
  const [txLat, txLon, txAlt] = txParams;

  res.json({ server, rxLat, rxLon, rxAlt, txLat, txLon, txAlt, fc });

});

// helper function to check if a value is a valid number
function isValidNumber(value) {
  return !isNaN(value);
}

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
