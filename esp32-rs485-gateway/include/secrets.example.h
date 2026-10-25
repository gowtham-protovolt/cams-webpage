#pragma once

// Copy this file to secrets.h and replace every placeholder locally.
// Never commit secrets.h.
#define WIFI_SSID "replace-with-plant-wifi"
#define WIFI_PASSWORD "replace-with-wifi-password"

// EMQX Serverless cloud endpoint. Download the deployment CA certificate
// and define MQTT_CA_CERT for full server-certificate verification.
#define MQTT_HOST "i88d1ae2.ala.asia-southeast1.emqxsl.com"
#define MQTT_PORT 8883
#define MQTT_USERNAME_CAMS_01 "cams-esp32-001"
#define MQTT_PASSWORD_CAMS_01 "replace-with-cams-01-password"
#define MQTT_USERNAME_CAMS_02 "cams-esp32-002"
#define MQTT_PASSWORD_CAMS_02 "replace-with-cams-02-password"
#define MQTT_USERNAME_CAMS_03 "cams-esp32-003"
#define MQTT_PASSWORD_CAMS_03 "replace-with-cams-03-password"
