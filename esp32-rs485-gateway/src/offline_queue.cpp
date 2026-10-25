#include "offline_queue.h"

#include <LittleFS.h>

#include "config.h"

uint32_t OfflineTelemetryQueue::checksum(const BufferedTelemetryRecord &record) const {
  const uint8_t *bytes = reinterpret_cast<const uint8_t *>(&record);
  const size_t length = offsetof(BufferedTelemetryRecord, checksum);
  uint32_t hash = 2166136261UL;
  for (size_t index = 0; index < length; ++index) {
    hash ^= bytes[index];
    hash *= 16777619UL;
  }
  return hash;
}

bool OfflineTelemetryQueue::valid(const BufferedTelemetryRecord &record) const {
  return record.magic == RECORD_MAGIC && record.version == RECORD_VERSION && record.checksum == checksum(record);
}

void OfflineTelemetryQueue::refreshCount() {
  File queue = LittleFS.open(QUEUE_PATH, FILE_READ);
  const size_t size = queue ? queue.size() : 0;
  if (queue) queue.close();
  if (readOffset_ > size || size % sizeof(BufferedTelemetryRecord) != 0) readOffset_ = 0;
  recordCount_ = (size - readOffset_) / sizeof(BufferedTelemetryRecord);
}

bool OfflineTelemetryQueue::begin() {
  mounted_ = LittleFS.begin(false);
  if (!mounted_) {
    Serial.println("[buffer] LittleFS mount failed; formatting once");
    if (!LittleFS.format()) return false;
    mounted_ = LittleFS.begin(false);
  }
  if (!mounted_) return false;

  File offset = LittleFS.open(OFFSET_PATH, FILE_READ);
  if (offset && offset.size() == sizeof(readOffset_)) offset.read(reinterpret_cast<uint8_t *>(&readOffset_), sizeof(readOffset_));
  if (offset) offset.close();
  refreshCount();
  Serial.printf("[buffer] ready with %u pending samples\n", static_cast<unsigned>(recordCount_));
  return true;
}

bool OfflineTelemetryQueue::persistOffset() {
  File offset = LittleFS.open(OFFSET_PATH, FILE_WRITE);
  if (!offset) return false;
  const bool ok = offset.write(reinterpret_cast<const uint8_t *>(&readOffset_), sizeof(readOffset_)) == sizeof(readOffset_);
  offset.flush();
  offset.close();
  acknowledgementsSinceCheckpoint_ = 0;
  return ok;
}

bool OfflineTelemetryQueue::compact(size_t dropRecords) {
  if (!mounted_) return false;
  File source = LittleFS.open(QUEUE_PATH, FILE_READ);
  if (!source) return false;
  const size_t available = (source.size() - readOffset_) / sizeof(BufferedTelemetryRecord);
  dropRecords = min(dropRecords, available);
  source.seek(readOffset_ + dropRecords * sizeof(BufferedTelemetryRecord));
  LittleFS.remove(TEMP_PATH);
  File target = LittleFS.open(TEMP_PATH, FILE_WRITE);
  if (!target) {
    source.close();
    return false;
  }
  uint8_t buffer[512];
  while (source.available()) {
    const size_t count = source.read(buffer, sizeof(buffer));
    if (count == 0 || target.write(buffer, count) != count) {
      source.close();
      target.close();
      LittleFS.remove(TEMP_PATH);
      return false;
    }
  }
  source.close();
  target.flush();
  target.close();
  LittleFS.remove(QUEUE_PATH);
  if (!LittleFS.rename(TEMP_PATH, QUEUE_PATH)) return false;
  readOffset_ = 0;
  droppedRecords_ += dropRecords;
  persistOffset();
  refreshCount();
  return true;
}

bool OfflineTelemetryQueue::enqueue(BufferedTelemetryRecord record) {
  if (!mounted_) return false;
  if (recordCount_ >= MAX_BUFFERED_SAMPLES && !compact(CAPACITY_RECOVERY_RECORDS)) return false;
  record.magic = RECORD_MAGIC;
  record.version = RECORD_VERSION;
  record.checksum = checksum(record);
  File queue = LittleFS.open(QUEUE_PATH, FILE_APPEND);
  if (!queue) return false;
  const bool ok = queue.write(reinterpret_cast<const uint8_t *>(&record), sizeof(record)) == sizeof(record);
  queue.flush();
  queue.close();
  if (ok) ++recordCount_;
  return ok;
}

bool OfflineTelemetryQueue::peek(BufferedTelemetryRecord &record) {
  if (!mounted_ || recordCount_ == 0) return false;
  File queue = LittleFS.open(QUEUE_PATH, FILE_READ);
  if (!queue || !queue.seek(readOffset_)) {
    if (queue) queue.close();
    return false;
  }
  const bool read = queue.read(reinterpret_cast<uint8_t *>(&record), sizeof(record)) == sizeof(record);
  queue.close();
  return read && valid(record);
}

bool OfflineTelemetryQueue::acknowledge(uint64_t sequence) {
  BufferedTelemetryRecord record{};
  if (!peek(record) || record.sequence != sequence) return false;
  readOffset_ += sizeof(BufferedTelemetryRecord);
  --recordCount_;
  ++acknowledgementsSinceCheckpoint_;
  if (recordCount_ == 0) {
    LittleFS.remove(QUEUE_PATH);
    LittleFS.remove(OFFSET_PATH);
    readOffset_ = 0;
    acknowledgementsSinceCheckpoint_ = 0;
    return true;
  }
  if (acknowledgementsSinceCheckpoint_ >= OFFSET_CHECKPOINT_RECORDS && !persistOffset()) return false;
  const size_t compactThreshold = 256UL * 1024UL;
  if (readOffset_ >= compactThreshold && readOffset_ >= recordCount_ * sizeof(BufferedTelemetryRecord)) return compact();
  return true;
}

size_t OfflineTelemetryQueue::pending() const { return recordCount_; }
uint32_t OfflineTelemetryQueue::dropped() const { return droppedRecords_; }
bool OfflineTelemetryQueue::ready() const { return mounted_; }
