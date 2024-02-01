# adsb2dd

Convert ADSB data to delay-Doppler truth - see a live instance at [http://adsb2dd.30hours.dev](http://adsb2dd.30hours.dev).

## Features

- Provides an API to input receiver/transmitter coordinates, radar center frequency and [tar1090](https://github.com/wiedehopf/tar1090) server.
- A web front-end calculator is provided to generate a correct API endpoint.
- Outputs JSON data with a delay in km and Doppler in Hz.
- Use the JSON output to map truth onto a delay-Doppler map, for example in [blah2](http://github.com/30hours/blah2).

## Usage

- Install docker and docker-compose on the host machine.
- Clone this repository to some directory.
- Run the docker compose command.

```
sudo git clone http://github.com/30hours/blah2 /opt/adsb2dd
cd /opt/adsb2dd
sudo docker compose up -d
```

The API front-end is available at [http://localhost:49155](http://localhost:49155).

## Method of Operation

The delay-Doppler data is computed as follows:

- The [tar1090](https://github.com/wiedehopf/tar1090) server provides the latitude, longitude and altitude of aircraft at the endpoint `/data/aircraft.json` - an example from a live server is [http://adsb.30hours.dev/data/aircraft.json](http://adsb.30hours.dev/data/aircraft.json). The default data update rate is once per second. A timestamp is provided to match coordinates with a time.
- The bistatic range of each aircraft is computed using `distance_rx_to_target + distance_tx_to_target - distance_rx_to_rx`. The latitude, longitude and altitude is converted to [ECEF](https://en.wikipedia.org/wiki/Earth-centered,_Earth-fixed_coordinate_system) coordinates which means distances can be computed with a simple `norm`. 
- The bistatic Doppler by definition is the rate-of-change of the bistatic range. Unfortunately it's well known that [differentiation amplifies noise](https://dsp.stackexchange.com/questions/16540/derivative-of-noisy-signal) - as the bistatic range data has a small amount of noise, the Doppler values have even larger noise. We also require a causal solution (dependent only on previous values) which means we can't use a more accurate [Savitzky Golay filter](https://en.wikipedia.org/wiki/Savitzky%E2%80%93Golay_filter). The approach here is to use less accurate moving average filter to smooth the bistatic rangedata prior to differentation.
- Currently computing a smoothed derivative by finding the median on the last *k* samples of the bistatic range vector. This is by no means optimal - however it seems to work reasonably well and follow targets with *k=10*. Note this is causal and generally slightly lags the truth since we're using previous samples unweighted.
- Future work will be to try and extrapolate/guess future bistatic range values (assume a constant acceleration) and apply the Savitzky Golay filter - I will call this pseudo-causal since I'm guessing future samples. I expect this will be a more accurate source of truth.
- On second thoughts, may make more sense to run a Kalman filter smoother (which is inherently causal).

The system architecture is as follows:

- The first API call to a set of inputs will result in a blank response `{}`. This is fine - the first API call adds the set of inputs to the processing loop.
- This approach allows multiple sets of inputs to run simultaneously on the same server.
- Refresh and if there are moving aircraft in the server, the delay/Doppler coordinates will be computed.
- The API provides a JSON output in the format `{"<hex-code>":{"timestamp":<timestamp>,"flight":<flight-number>,"delay":<delay>,"doppler":<doppler>}}`.
- If no API calls are provided for a set of inputs after 10 minutes, that set will be dropped from the processing loop.

## Future Work

- Add a 2D plot showing all aircraft in delay-Doppler space.
- Add a map showing aircraft in geographic space below the above plot.
- Investigate algorithms to accurately compute smooth Doppler values.
- Some functional tests to ensure key features are working.

## License

[MIT](https://choosealicense.com/licenses/mit/)
