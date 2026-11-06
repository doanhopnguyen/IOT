package com.smartaccess.repository;

import com.smartaccess.model.Telemetry;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface TelemetryRepository extends JpaRepository<Telemetry, Long> {
    Optional<Telemetry> findFirstByDevice_DeviceIdAndMetricNameOrderByOccurredAtDesc(Long deviceId, String metricName);

    List<Telemetry> findByDevice_DeviceIdAndMetricNameAndOccurredAtBetweenOrderByOccurredAt(
            Long deviceId, String metricName, LocalDateTime from, LocalDateTime to);

    boolean existsByMessageUuid(String messageUuid);

    /** Lần gần nhất metric KHÁC giá trị cho trước (ví dụ lần cuối cửa còn đóng/không rõ). */
    Optional<Telemetry> findFirstByDevice_DeviceIdAndMetricNameAndMetricValueNotOrderByOccurredAtDesc(
            Long deviceId, String metricName, String metricValue);

    /** Lần đầu metric mang giá trị cho trước sau một thời điểm (ví dụ lúc cửa bắt đầu mở). */
    Optional<Telemetry> findFirstByDevice_DeviceIdAndMetricNameAndMetricValueAndOccurredAtAfterOrderByOccurredAtAsc(
            Long deviceId, String metricName, String metricValue, LocalDateTime after);
}
