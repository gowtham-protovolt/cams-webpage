window.CAMS_CONFIG = {
  apiBaseUrl: ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:3100"
    : ""
};
