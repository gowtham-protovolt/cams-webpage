#pragma once

// Copy this file to secrets.h and replace every placeholder locally.
// Never commit secrets.h.
#define WIFI_SSID "replace-with-plant-wifi"
#define WIFI_PASSWORD "replace-with-wifi-password"

// Use the Docker host's reserved LAN address for local commissioning.
#define MQTT_HOST "192.168.0.184"
#define MQTT_PORT 1884
#define MQTT_USERNAME_CAMS_01 "CAMS-01"
#define MQTT_PASSWORD_CAMS_01 "replace-with-cams-01-password"
#define MQTT_USERNAME_CAMS_02 "CAMS-02"
#define MQTT_PASSWORD_CAMS_02 "replace-with-cams-02-password"
#define MQTT_USERNAME_CAMS_03 "CAMS-03"
#define MQTT_PASSWORD_CAMS_03 "replace-with-cams-03-password"
