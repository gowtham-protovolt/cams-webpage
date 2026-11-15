import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:3100";
const sessionCookie = __ENV.CAMS_SESSION || "";

export const options = {
  stages: [
    { duration: "1m", target: 250 },
    { duration: "1m", target: 500 },
    { duration: "2m", target: 1000 },
    { duration: "5m", target: 1000 },
    { duration: "1m", target: 0 }
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1000", "p(99)<2000"]
  }
};

export default function () {
  const params = sessionCookie ? { headers: { Cookie: `cams_session=${sessionCookie}` } } : {};
  const responses = http.batch([
    ["GET", `${baseUrl}/`, null, params],
    ["GET", `${baseUrl}/api/health`, null, params],
    ["GET", `${baseUrl}/api/dashboard/summary`, null, params]
  ]);
  check(responses[0], { "webpage responds": response => response.status === 200 });
  check(responses[1], { "health responds": response => response.status === 200 });
  check(responses[2], {
    "dashboard responds or requires login": response => response.status === 200 || response.status === 401
  });
  sleep(1);
}
