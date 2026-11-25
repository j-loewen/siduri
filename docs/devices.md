# Smart devices

Devices are added on the Equipment page: under **Smart devices**, click **Add device** and choose how the device sends its readings (RAPT Brew, iSpindel, Tilt, or another device or script). The app then shows everything to enter on the device's side. Connected devices are shown as cards. Click one to rename it, see what it measures, remove it from its batch and fermenter, or check the last messages it sent.

Devices are linked to a batch on the batch's **Fermentation** tab, with **Add device**:
- **Batch in a fermenter:** the device is put in that fermenter (e.g. FV1). Its readings go to whichever batch is in FV1, so it carries over to the next brew automatically. A batch that is still planned gets readings once it is brewing.
- **Batch without a fermenter:** the device is linked to that batch only.

The unlink icon on a device's tile removes it from the batch again.

Hydrometer readings (gravity and temperature) appear in the batch's chart on its **Fermentation** tab. Temperature controllers and fermentation chambers show their current and target temperature there.

## RAPT (Pill, temperature controller, fermentation chamber)

RAPT devices send their readings through RAPT's *Brew Data Stream* (formerly webhooks). RAPT offers no API for other apps, so the app can't fetch readings from the RAPT cloud or set a chamber's target temperature; set the target in the RAPT app. The RAPT cloud must be able to reach your server from the internet (HTTPS through a reverse proxy or a tunnel).

Choose **Add device → RAPT Brew**. It shows one URL and one key. They work for all your RAPT devices.

1. In the RAPT portal, go to **My Integrations → RAPT Brew Data Stream → Create Stream → Custom**.
2. **Name:** anything, for example `Siduri`.
3. **URL:** the URL shown in the app (`https://<your server>/api/integrations/rapt`).
4. **Method:** leave it on POST.
5. **Headers:** click **Add header**. Name: `Authorization`. Value: `Bearer <key>`, copied from the app.
6. Save. RAPT shows a signing secret once. The app doesn't need it (the key in the header authenticates).
7. Repeat for each device. The free plan allows one stream per device, and each one uses the same URL and header.

RAPT sends at most every 15 minutes. With its first message, a device appears under Smart devices on its own. Then link it to a batch on the batch's Fermentation tab. Its **Last messages** show what RAPT sent.

The URL shown is this server's address as your browser sees it, unless `BASE_URL` is set. If you open the app at a local address, set `BASE_URL` to its public address so the app shows that one. **Create a new key** replaces the key; then change the header in every RAPT stream.

RAPT sends one JSON message per device: `{ "event": "telemetry", "deviceId": …, "deviceType": "PillHydrometer", "name": …, "timestamp": …, "data": { "gravity": 1.05, "temperature": 20, "battery": 100, "rssi": -60 } }`. The device is matched by `deviceId`. The key can also be sent as an `X-Api-Key` header, or as `?key=` in the URL.

## iSpindel

Choose **Add device → iSpindel**, name it and click **Create**. The app then shows the values for the iSpindel's configuration page:

1. Put the iSpindel in configuration mode: press its reset button twice quickly (or switch it off and on). It opens a Wi-Fi network named `iSpindel_…`; connect to it, and the configuration page opens (otherwise open `http://192.168.4.1`). Choose **Configuration**.
2. **Service Type:**
   - If the app runs on HTTPS: **HTTPS Post**. **Server Address** is the app's address including `https://` (e.g. `https://siduri.example.com`); this service has no port. It doesn't check the certificate.
   - Otherwise: **HTTP**, with **Server Address** (host name or IP) and **Server Port**.
3. **Path / URI:** the part of the device's push URL that starts with `/api/integrations/telemetry/…`.
4. **Token/ API key** can stay empty: the path identifies the device.
5. **Polynominal:** your calibration formula. Without it the iSpindel sends gravity 0, which the app ignores; only the temperature is recorded.
6. Click **Save**. The first reading arrives after the **Update Interval**.

The iSpindel posts JSON (`name, ID, angle, temperature, temp_units, battery, gravity, interval, RSSI`). The app reads the gravity in SG or °Plato, the temperature in °C, °F or K, and the battery in volts.

## Tilt (and Tilt Pro)

The Tilt sends its readings over Bluetooth to the Tilt app on a phone or tablet, or to a TiltPi. Their *cloud logging* forwards them to this app, by default every 15 minutes. Choose **Add device → Tilt**: it shows one **cloud URL** for all your Tilts. The key is part of the URL, because the Tilt apps can't add a header.

- **Tilt app:** in the settings (gear icon), turn on **Use Custom Cloud URL** and paste the URL into the custom cloud URL field (not the default Cloud URL). Then, for each Tilt, tap its colour, enter the beer name and tap **Start New Log**. The labels differ slightly between app versions.
- **TiltPi:** in the logging settings of the Tilt's colour, paste the URL as **Cloud URL**, keep the interval at 15 minutes or more, turn off **Use Default Cloud URL for All**, and start logging to the cloud.

After each send the app shows "success". With its first reading, each colour appears under Smart devices as its own device ("Tilt Pink"). If the app identifies Tilts by MAC address, each MAC is its own device. Link them to a batch on the batch's Fermentation tab.

The phone or TiltPi has to stay near the Tilt and keep running. A phone reaches a local address only while it is on your home network; to keep logging when it is away, make the app reachable over HTTPS and set `BASE_URL`. **Create a new URL** replaces the key; then change the URL in the Tilt app or TiltPi.

The Tilt posts form data (`Timepoint, Temp, SG, Beer, Color, Comment`, see the [Tilt cloud logging API](https://tilthydrometer.com/pages/tilt-cloud-logging-api)). `Temp` is always °F and `SG` always specific gravity (4 decimals on a Tilt Pro). `Timepoint` is the phone's local time without a time zone, so the time of arrival is used instead. The e-mail address the Tilt app may put in `Comment` on a new log is not stored.

## Other devices

Any device or script can POST to a device's push URL. JSON, form data and query parameters all work, for example:

```json
{ "gravity": 1.048, "temperature": 19.5, "battery": 95, "timestamp": "2026-11-23T10:00:00Z" }
```

- **Field names** are matched loosely: `gravity`, `sg`, `plato`, `temperature`, `temp`, `temp_units`, `battery`, `rssi`, `created_on`, and similar.
- **Gravity** can be given as SG (1.048), SG × 1000 (1048) or °Plato (12.1).
- **The last ten messages** are shown on the device, marked *Read* or *Not understood*, so you can check what arrives.
- **A new URL:** "Create a new URL" replaces the old one if it ever leaks.
