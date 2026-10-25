#pragma once

#include <Arduino.h>

struct __attribute__((packed)) BufferedTelemetryRecord {
  uint32_t magic;
  uint16_t version;
  uint16_t flags;
  uint64_t sequence;
  int64_t observedAtMs;
  int32_t pv1;
  int32_t pv2;
  int32_t pv3;
  uint16_t err1;
  uint16_t err2;
  uint16_t err3;
  uint32_t checksum;
};

class OfflineTelemetryQueue {
 public:
  bool begin();
  bool enqueue(BufferedTelemetryRecord record);
  bool peek(BufferedTelemetryRecord &record);
  bool acknowledge(uint64_t sequence);
  size_t pending() const;
  uint32_t dropped() const;
  bool ready() const;

 private:
  static constexpr const char *QUEUE_PATH = "/telemetry.queue";
  static constexpr const char *TEMP_PATH = "/telemetry.tmp";
  static constexpr const char *OFFSET_PATH = "/telemetry.offset";
  static constexpr uint32_t RECORD_MAGIC = 0x43414D53;
  static constexpr uint16_t RECORD_VERSION = 1;
  static constexpr size_t OFFSET_CHECKPOINT_RECORDS = 32;
  static constexpr size_t CAPACITY_RECOVERY_RECORDS = 3600;

  bool mounted_ = false;
  size_t readOffset_ = 0;
  size_t recordCount_ = 0;
  size_t acknowledgementsSinceCheckpoint_ = 0;
  uint32_t droppedRecords_ = 0;

  uint32_t checksum(const BufferedTelemetryRecord &record) const;
  bool valid(const BufferedTelemetryRecord &record) const;
  bool persistOffset();
  bool compact(size_t dropRecords = 0);
  void refreshCount();
};
