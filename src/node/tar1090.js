import fetch from 'node-fetch';

/// @brief Check that the tar1090 server is valid and active.
/// @param apiUrl Full path to aircraft.json.
/// @return True if tar1090 server is valid.
export async function checkTar1090(apiUrl) {
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
export async function getTar1090(apiUrl) {
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

