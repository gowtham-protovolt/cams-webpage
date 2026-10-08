#pragma once

// Copy this file to secrets.h and replace every placeholder locally.
// Never commit secrets.h.
#define WIFI_SSID "replace-with-plant-wifi"
#define WIFI_PASSWORD "replace-with-wifi-password"

// Use the Docker host's reserved LAN address for local commissioning.
#define MQTT_HOST "192.168.0.184"
#define MQTT_PORT 1884
#define MQTT_USERNAME "cams-esp32-001"
#define MQTT_PASSWORD "replace-with-device-password"

